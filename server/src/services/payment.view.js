/* The shape of a payment that a screen gets. The seller's fee and PayPal's ids stay out of a buyer's view. */
import { failureMessage } from '#shared/failures.js'

export function paymentView(payment) {
  return {
    id: payment.id,
    reference: payment.reference,
    status: payment.status,
    failureCode: payment.failureCode ?? null,
    failureMessage: payment.failureCode ? failureMessage(payment.failureCode) : null,
    provider: payment.provider,
    simulated: payment.provider === 'simulated',
    amountUsdCents: payment.amountUsdCents,
    displayCurrency: payment.displayCurrency,
    displayAmountMinor: payment.displayAmountMinor,
    fxRate: payment.fxRate,
    method: { id: payment.methodId, label: payment.methodLabel },
    country: { code: payment.countryCode, name: payment.countryName },
    product: { id: payment.productId, slug: payment.productSlug, title: payment.productTitle },
    buyer: { id: payment.buyerId, name: payment.buyerName, email: payment.buyerEmail },
    card: payment.cardLast4 ? { brand: payment.cardBrand, last4: payment.cardLast4 } : null,
    createdAt: payment.createdAt,
    completedAt: payment.completedAt,
  }
}
