import { describe, expect, it } from 'vitest'
import { dollars, readCapture, readCaptureResource, readPayout, toCents } from './mappers.js'

describe('money', () => {
  it('writes cents as dollars with two decimals', () => {
    expect(dollars(3900)).toBe('39.00')
    expect(dollars(5)).toBe('0.05')
    expect(dollars(123456)).toBe('1234.56')
  })

  it('reads PayPal amounts back to whole cents, without floating point drift', () => {
    expect(toCents('39.00')).toBe(3900)
    expect(toCents('0.29')).toBe(29)
    expect(toCents('19.99')).toBe(1999)
    expect(toCents('1.15')).toBe(115)
    expect(toCents('nope')).toBeNull()
    expect(toCents(undefined)).toBeNull()
  })
})

const captured = {
  id: '5O190127TN364715T',
  status: 'COMPLETED',
  payment_source: {
    card: { brand: 'VISA', last_digits: '1881', authentication_result: { liability_shift: 'POSSIBLE' } },
  },
  purchase_units: [
    {
      custom_id: 'payment-uuid',
      invoice_id: 'pb_ABC',
      payments: {
        captures: [
          {
            id: 'CAP123',
            status: 'COMPLETED',
            amount: { currency_code: 'USD', value: '39.00' },
            custom_id: 'payment-uuid',
            invoice_id: 'pb_ABC',
            seller_receivable_breakdown: {
              gross_amount: { currency_code: 'USD', value: '39.00' },
              paypal_fee: { currency_code: 'USD', value: '1.57' },
              net_amount: { currency_code: 'USD', value: '37.43' },
            },
          },
        ],
      },
    },
  ],
}

describe('readCapture', () => {
  it('reads what happened to the money', () => {
    expect(readCapture(captured)).toEqual({
      orderId: '5O190127TN364715T',
      orderStatus: 'COMPLETED',
      captureId: 'CAP123',
      captureStatus: 'COMPLETED',
      statusReason: null,
      currency: 'USD',
      amountUsdCents: 3900,
      paypalFeeUsdCents: 157,
      customId: 'payment-uuid',
      invoiceId: 'pb_ABC',
      cardBrand: 'visa',
      cardLast4: '1881',
      liabilityShift: 'POSSIBLE',
    })
  })

  it('keeps only card brands the payments table knows, and four digit endings', () => {
    const amex = structuredClone(captured)
    amex.payment_source.card = { brand: 'AMEX', last_digits: '123' }
    expect(readCapture(amex)).toMatchObject({ cardBrand: null, cardLast4: null })
    const mastercard = structuredClone(captured)
    mastercard.payment_source.card = { brand: 'mastercard', last_digits: '0011' }
    expect(readCapture(mastercard)).toMatchObject({ cardBrand: 'mastercard', cardLast4: '0011' })
  })

  it('never throws on a thin answer', () => {
    expect(readCapture({})).toMatchObject({
      captureId: null,
      captureStatus: null,
      amountUsdCents: null,
      cardBrand: null,
    })
    expect(readCapture(undefined).orderId).toBeNull()
  })

  it('reads the reason a capture is pending or declined', () => {
    const pending = structuredClone(captured)
    pending.purchase_units[0].payments.captures[0].status = 'PENDING'
    pending.purchase_units[0].payments.captures[0].status_details = { reason: 'ECHECK' }
    expect(readCapture(pending)).toMatchObject({ captureStatus: 'PENDING', statusReason: 'ECHECK' })
  })
})

describe('readCaptureResource', () => {
  it('reads a capture as a webhook sends it', () => {
    const resource = {
      id: 'CAP123',
      status: 'COMPLETED',
      amount: { currency_code: 'USD', value: '39.00' },
      custom_id: 'payment-uuid',
      invoice_id: 'pb_ABC',
      supplementary_data: { related_ids: { order_id: 'ORDER1' } },
      seller_receivable_breakdown: { paypal_fee: { currency_code: 'USD', value: '1.57' } },
    }
    expect(readCaptureResource(resource)).toMatchObject({
      orderId: 'ORDER1',
      captureId: 'CAP123',
      captureStatus: 'COMPLETED',
      amountUsdCents: 3900,
      paypalFeeUsdCents: 157,
      customId: 'payment-uuid',
      invoiceId: 'pb_ABC',
    })
  })

  it('never throws on an empty resource', () => {
    expect(readCaptureResource(undefined)).toMatchObject({ captureId: null, orderId: null, amountUsdCents: null })
  })
})

describe('readPayout', () => {
  it('reads a batch and how each item went', () => {
    expect(
      readPayout({
        batch_header: {
          payout_batch_id: 'BATCH1',
          batch_status: 'SUCCESS',
          sender_batch_header: { sender_batch_id: 'po_ABC' },
        },
        items: [
          {
            payout_item_id: 'ITEM1',
            transaction_status: 'UNCLAIMED',
            payout_item: { sender_item_id: 'po_ABC-1' },
            errors: { name: 'RECEIVER_UNREGISTERED' },
          },
        ],
      }),
    ).toEqual({
      batchId: 'BATCH1',
      senderBatchId: 'po_ABC',
      status: 'SUCCESS',
      items: [{ itemId: 'po_ABC-1', payoutItemId: 'ITEM1', status: 'UNCLAIMED', error: 'RECEIVER_UNREGISTERED' }],
    })
  })

  it('copes with a batch that has no items yet', () => {
    expect(readPayout({ batch_header: { payout_batch_id: 'B', batch_status: 'PENDING' } })).toMatchObject({
      status: 'PENDING',
      items: [],
    })
    expect(readPayout(null).batchId).toBeNull()
  })
})
