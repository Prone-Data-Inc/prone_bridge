/* A stand-in for PayPal's JavaScript SDK v6, with the same surface the checkout uses: window.paypal.createInstance gives an
   instance that can find eligible methods and make a PayPal session or a card fields session. The test plays PayPal's
   part by calling the callbacks it was given, or by changing what submit answers. */
import { vi } from 'vitest'

export function installFakePaypal({ eligible = { paypal: true, advanced_cards: true } } = {}) {
  const fake = {
    callbacks: null,
    components: [],
    eligible: { ...eligible },
    /* what the card fields answer when the buyer presses Pay: { state: 'succeeded' | 'canceled' | 'failed' } */
    submitAnswer: { state: 'succeeded', data: { liabilityShift: 'POSSIBLE' } },
  }

  fake.paypalSession = {
    /* PayPal asks for the order while it opens its window. */
    start: vi.fn(async (_options, order) => (await order).orderId),
  }

  fake.cardSession = {
    createCardFieldsComponent: vi.fn(({ type, placeholder }) => {
      const field = document.createElement('div')
      field.dataset.type = type
      field.dataset.placeholder = placeholder
      return field
    }),
    submit: vi.fn(async () => fake.submitAnswer),
  }

  fake.sdk = {
    findEligibleMethods: vi.fn(async () => ({ isEligible: (name) => Boolean(fake.eligible[name]) })),
    createPayPalOneTimePaymentSession: vi.fn(async (callbacks) => {
      fake.callbacks = callbacks
      return fake.paypalSession
    }),
    createCardFieldsOneTimePaymentSession: vi.fn(() => fake.cardSession),
  }

  window.paypal = {
    createInstance: vi.fn(async ({ clientToken, components }) => {
      fake.components.push({ clientToken, components })
      return fake.sdk
    }),
  }
  return fake
}

export const removeFakePaypal = () => {
  delete window.paypal
}
