/* The checkout: it turns "this buyer wants this course, from this country, with this method" into a payment.
   Everything that matters is decided here, on the server, from the database: the price, the local amount, the fee and
   whether the method may be used. The browser only says what it wants. A buyer's country chooses which methods and which
   currency they see. It is never used to judge risk. */
import { feeFor, toLocalMinor } from '#shared/money.js'
import { badRequest, conflict, notFound, unavailable } from '#server/lib/errors.js'
import { reference } from '#server/lib/ids.js'
import { LINK_REASONS, linkState } from '#server/lib/links.js'
import { createCheckoutRepository } from '#server/repositories/checkout.repository.js'
import { createLinkRepository } from '#server/repositories/link.repository.js'
import { createPaymentRepository } from '#server/repositories/payment.repository.js'
import { paymentView } from './payment.view.js'

export function createCheckoutService({ db, catalogRepository, paypal, risk, now = () => new Date() }) {
  const checkout = createCheckoutRepository({ db })
  const payments = createPaymentRepository({ db })
  const links = createLinkRepository({ db })

  /* The payment link a request says it came from, when it really is a link to this course of this seller. A link that
     points elsewhere is ignored, so a made up code only loses the attribution. With strict, a link that cannot be used
     is refused, so a payment never goes through a paused, expired or full link. */
  async function linkFor(code, merchant, product, { strict = false } = {}) {
    if (!code) return null
    const link = await links.findByCode(code)
    if (!link || link.merchantId !== merchant.id || link.productId !== product.id) {
      if (strict) throw badRequest('That payment link is not for this course.')
      return null
    }
    const state = linkState(link, now())
    if (state !== 'active') {
      if (strict) throw conflict(LINK_REASONS[state])
      return null
    }
    return link
  }

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
    async startSession({ merchant: merchantSlug, product: productSlug, country, link }) {
      const merchant = await merchantOrFail(merchantSlug)
      const product = await productOrFail(merchant, productSlug)
      if (!(await checkout.countryExists(country))) throw badRequest('We do not serve that country yet.')
      const from = await linkFor(link, merchant, product)
      return {
        id: await payments.createSession({
          merchantId: merchant.id,
          productId: product.id,
          countryCode: country,
          linkId: from?.id ?? null,
        }),
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
      link,
    }) {
      const merchant = await merchantOrFail(merchantSlug)
      const product = await productOrFail(merchant, productSlug)
      const from = await linkFor(link, merchant, product, { strict: true })

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

      const { id, fresh } = await db.tx(async (t) => {
        const tx = { checkout: createCheckoutRepository({ db: t }), payments: createPaymentRepository({ db: t }) }
        const person = await tx.checkout.upsertBuyer({ email: buyer.email, name: buyer.name, countryCode: country })
        if (await tx.checkout.owns(person.id, product.id)) throw conflict('You already own this course.')

        /* Every payment is scored before any money moves, from what the buyer did. The country is not an input: the
           call below does not even pass it. Low goes ahead, medium waits for a person, high is blocked. */
        const gate = await risk.gate(t, {
          buyerId: person.id,
          merchantId: merchant.id,
          methodId: offer.methodId,
          email: buyer.email,
          amountUsdCents,
        })

        const created = await tx.payments.insert({
          reference: reference('pb'),
          merchantId: merchant.id,
          productId: product.id,
          buyerId: person.id,
          methodId: offer.methodId,
          countryCode: country,
          amountUsdCents,
          ...money,
          status: gate.status ?? (viaPaypal ? 'requires_payment' : 'processing'),
          failureCode: gate.failureCode,
          finished: gate.status === 'blocked',
          provider: offer.provider,
          idempotencyKey,
          linkId: from?.id ?? null,
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
          return { id: existing.id, fresh: false }
        }

        await tx.payments.addEvent({
          paymentId: created,
          type: 'created',
          actor: 'buyer',
          data: { method: offer.methodId, country },
        })
        await risk.record(t, await tx.payments.findById(created), gate.assessment)
        if (sessionId)
          await tx.payments.attachToSession({ sessionId, buyerId: person.id, paymentId: created, countryCode: country })
        return { id: created, fresh: true }
      })

      const view = paymentView(await payments.findById(id))

      /* Held or blocked: no PayPal order is made, the buyer cannot pay. The AI words the reviewer's note once, now. */
      if (view.status === 'in_review' || view.status === 'blocked') {
        if (fresh) await risk.explain(id)
        return { payment: view }
      }

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
