/* PayPal's answers, read into the small shapes the rest of the server uses. PayPal's JSON is large and optional almost
   everywhere, so every field is read defensively: a missing field is null, never an exception. Money crosses this line
   as integer US cents. */

export const dollars = (cents) => (cents / 100).toFixed(2)

export const toCents = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(number * 100) : null
}

/* The payments table only knows these two card brands. Any other brand is left out rather than refused. */
const BRANDS = { VISA: 'visa', MASTERCARD: 'mastercard' }

/* The capture inside an order response: what happened to the money.
   captureStatus is PayPal's own word: COMPLETED, DECLINED, PENDING, FAILED, REFUNDED, PARTIALLY_REFUNDED. */
export function readCapture(order) {
  const unit = order?.purchase_units?.[0]
  const capture = unit?.payments?.captures?.[0]
  const card = order?.payment_source?.card
  return {
    orderId: order?.id ?? null,
    orderStatus: order?.status ?? null,
    captureId: capture?.id ?? null,
    captureStatus: capture?.status ?? null,
    statusReason: capture?.status_details?.reason ?? null,
    currency: capture?.amount?.currency_code ?? null,
    amountUsdCents: capture?.amount ? toCents(capture.amount.value) : null,
    paypalFeeUsdCents: capture?.seller_receivable_breakdown?.paypal_fee
      ? toCents(capture.seller_receivable_breakdown.paypal_fee.value)
      : null,
    customId: capture?.custom_id ?? unit?.custom_id ?? null,
    invoiceId: capture?.invoice_id ?? unit?.invoice_id ?? null,
    cardBrand: BRANDS[String(card?.brand ?? '').toUpperCase()] ?? null,
    cardLast4: /^\d{4}$/.test(card?.last_digits ?? '') ? card.last_digits : null,
    liabilityShift: card?.authentication_result?.liability_shift ?? null,
  }
}

/* A capture resource as a webhook sends it (PAYMENT.CAPTURE.*): the same facts, one level up. */
export function readCaptureResource(resource) {
  return {
    orderId: resource?.supplementary_data?.related_ids?.order_id ?? null,
    orderStatus: null,
    captureId: resource?.id ?? null,
    captureStatus: resource?.status ?? null,
    statusReason: resource?.status_details?.reason ?? null,
    currency: resource?.amount?.currency_code ?? null,
    amountUsdCents: resource?.amount ? toCents(resource.amount.value) : null,
    paypalFeeUsdCents: resource?.seller_receivable_breakdown?.paypal_fee
      ? toCents(resource.seller_receivable_breakdown.paypal_fee.value)
      : null,
    customId: resource?.custom_id ?? null,
    invoiceId: resource?.invoice_id ?? null,
    cardBrand: null,
    cardLast4: null,
    liabilityShift: null,
  }
}

/* A payout batch: its status, and how each item went. batch_status is SUCCESS, PENDING, PROCESSING, DENIED or CANCELED. */
export function readPayout(body) {
  const header = body?.batch_header
  return {
    batchId: header?.payout_batch_id ?? null,
    senderBatchId: header?.sender_batch_header?.sender_batch_id ?? null,
    status: header?.batch_status ?? null,
    items: (body?.items ?? []).map((item) => ({
      itemId: item.payout_item?.sender_item_id ?? null,
      payoutItemId: item.payout_item_id ?? null,
      status: item.transaction_status ?? null,
      error: item.errors?.name ?? null,
    })),
  }
}
