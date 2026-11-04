/* The checkout: it turns "this buyer wants this course, from this country, with this method" into a payment.
   Everything that matters is decided here, on the server, from the database: the price, the local amount, the fee and
   whether the method may be used. The browser only says what it wants. A buyer's country chooses which methods and which
   currency they see. It is never used to judge risk. */
import { feeFor, toLocalMinor } from '#shared/money.js'
import { badRequest, conflict, notFound, unavailable } from '#server/lib/errors.js'
import { reference } from '#server/lib/ids.js'
import { createCheckoutRepository } from '#server/repositories/checkout.repository.js'
import { createPaymentRepository } from '#server/repositories/payment.repository.js'
import { paymentView } from './payment.view.js'

export function createCheckoutService({ db, catalogRepository, paypal }) {
  const checkout = createCheckoutRepository({ db })
  const payments = createPaymentRepository({ db })

  async function merchantOrFail(slug) {
    const merchant = await catalogRepository.findMerchant(slug)
    if (!merchant) throw notFound('We could not find that seller.')
    return merchant
  }

  async function productOrFail(merchant, slug) {
    const product = await checkout.findProduct(merchant.id, slug)
    if (!product) throw notFound('That course is not available.')
    return product
  }

  return {
    /* A visit to the checkout. It lets the seller see who started and who finished. */
    async startSession({ merchant: merchantSlug, product: productSlug, country }) {
      const merchant = await merchantOrFail(merchantSlug)
      const product = await productOrFail(merchant, productSlug)
      if (!(await checkout.countryExists(country))) throw badRequest('We do not serve that country yet.')
      return {
        id: await payments.createSession({ merchantId: merchant.id, productId: product.id, countryCode: country }),
      }
    },

    async changeSessionCountry(id, country) {
      if (!(await checkout.countryExists(country))) throw badRequest('We do not serve that country yet.')
      await payments.updateSessionCountry(id, country)
      return { id, country }
    },

    async createPayment({
      idempotencyKey,
      merchant: merchantSlug,
      product: productSlug,
      country,
      method,
      sessionId,
      buyer,
    }) {
      const merchant = await merchantOrFail(merchantSlug)
      const product = await productOrFail(merchant, productSlug)

      const offer = await checkout.findOffer(merchant.id, country, method)
      const available =
        offer &&
        offer.countryActive &&
        offer.platformEnabled &&
        offer.merchantEnabled &&
        offer.corridorStatus !== 'down'
      if (!available) throw badRequest('That payment method is not available in this country.')
      /* Card and PayPal go through PayPal, which only charges in US dollars. Local methods show the local price. */
      const viaPaypal = offer.provider === 'paypal'
      if (viaPaypal && !paypal.status().available) throw unavailable('PayPal is not connected yet.')

      const amountUsdCents = product.priceUsdCents
      const money = {
        displayCurrency: viaPaypal ? 'USD' : offer.currency,
        displayAmountMinor: viaPaypal
          ? amountUsdCents
          : toLocalMinor(amountUsdCents, {
              fxPerUsd: offer.fxPerUsd,
              minorUnits: offer.minorUnits,
              priceStep: offer.priceStep,
            }),
        fxRate: viaPaypal ? 1 : offer.fxPerUsd,
        feeUsdCents: feeFor(amountUsdCents, { feeBps: offer.feeBps, feeFixedCents: offer.feeFixedCents }),
      }

      const id = await db.tx(async (t) => {
        const tx = { checkout: createCheckoutRepository({ db: t }), payments: createPaymentRepository({ db: t }) }
        const person = await tx.checkout.upsertBuyer({ email: buyer.email, name: buyer.name, countryCode: country })
        if (await tx.checkout.owns(person.id, product.id)) throw conflict('You already own this course.')

        const created = await tx.payments.insert({
          reference: reference('pb'),
          merchantId: merchant.id,
          productId: product.id,
          buyerId: person.id,
          methodId: offer.methodId,
          countryCode: country,
          amountUsdCents,
          ...money,
          status: viaPaypal ? 'requires_payment' : 'processing',
          provider: offer.provider,
          idempotencyKey,
        })

        /* The same request sent twice is the same payment. A key reused for something else is refused. */
        if (!created) {
          const existing = await tx.payments.findByKey(idempotencyKey)
          const same =
            existing.buyerId === person.id &&
            existing.productId === product.id &&
            existing.methodId === offer.methodId &&
            existing.countryCode === country
          if (!same) throw conflict('That request id was already used for another payment.')
          return existing.id
        }

        await tx.payments.addEvent({
          paymentId: created,
          type: 'created',
          actor: 'buyer',
          data: { method: offer.methodId, country },
        })
        if (sessionId)
          await tx.payments.attachToSession({ sessionId, buyerId: person.id, paymentId: created, countryCode: country })
        return created
      })

      const view = paymentView(await payments.findById(id))

      /* A PayPal payment needs its order before the buyer can pay. A repeat of the same request gets the same order. */
      if (viaPaypal && (view.status === 'requires_payment' || view.status === 'processing')) {
        const { orderId } = await paypal.createOrder(id)
        return { payment: view, paypal: { orderId } }
      }
      return { payment: view }
    },

    async getPayment(id) {
      const payment = await payments.findById(id)
      if (!payment) throw notFound('We could not find that payment.')
      return paymentView(payment)
    },
  }
}
