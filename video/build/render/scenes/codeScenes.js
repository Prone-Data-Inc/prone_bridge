/* s09 and s10: the code behind PayPal and the AI. Every cue is a spoken word, found in the scene's own timing. */
import { said } from '../lib.js'
import { codeScene } from './code.js'
import { paypalExtras } from './paypalExtras.js'

/* The PayPal sandbox integration: Orders, Payouts, and the webhook that PayPal itself verifies. */
export const paypalCode = codeScene({
  id: 's09_paypal',
  extras: paypalExtras,
  panels: (scene) => {
    const orders = said(scene, 'Orders')
    const card = said(scene, 'card')
    const payouts = said(scene, 'Payouts')
    const webhooks = said(scene, 'Webhooks')
    const verified = said(scene, 'verified')
    const everything = said(scene, 'Everything')
    return [
      {
        key: 'orders',
        from: orders - 0.4,
        to: payouts - 0.2,
        badge: ['POST /v2/checkout/orders', 'PayPal Orders v2'],
        highlights: [
          { lines: [122, 122], at: orders, until: card + 0.3 },
          { lines: [136, 136], at: card + 0.3, until: payouts - 0.25 },
        ],
      },
      {
        key: 'payouts',
        from: payouts - 0.35,
        to: webhooks - 0.2,
        badge: ['POST /v1/payments/payouts', 'PayPal Payouts'],
        highlights: [{ lines: [177, 177], at: payouts, until: webhooks - 0.25 }],
      },
      {
        key: 'webhook',
        from: webhooks - 0.35,
        to: everything - 0.1,
        badge: ['verify-webhook-signature', 'Verified by PayPal'],
        highlights: [
          { lines: [162, 162], at: webhooks, until: verified },
          { lines: [174, 174], at: verified, until: everything - 0.15 },
        ],
      },
    ]
  },
})

/* The AI: the copilot's strict tools, the plain note on a held payment, the rules that decide, and the prompt that
   keeps the AI to explaining. */
export const aiCode = codeScene({
  id: 's10_ai',
  panels: (scene) => {
    const openai = said(scene, 'OpenAI')
    const copilot = said(scene, 'copilot')
    const strict = said(scene, 'strict')
    const plain = said(scene, 'plain')
    const held = said(scene, 'held')
    const rules = said(scene, 'rules')
    const decide = said(scene, 'decide')
    const explains = said(scene, 'explains')
    const never = said(scene, 'never')
    return [
      {
        key: 'tools',
        from: openai - 0.3,
        to: plain - 0.3,
        badge: ['12 strict tools', 'Copilot: 8 to read, 4 to propose'],
        highlights: [
          { lines: [66, 66], at: copilot, until: strict },
          { lines: [24, 24], at: strict, until: plain - 0.4 },
        ],
      },
      {
        key: 'explain',
        from: plain - 0.35,
        to: rules - 0.25,
        badge: ['risk.service.js', 'A plain note on every held payment'],
        highlights: [
          { lines: [159, 160], at: plain, until: held },
          { lines: [165, 169], at: held, until: rules - 0.3 },
        ],
      },
      {
        key: 'rules',
        from: rules - 0.3,
        to: explains - 0.15,
        badge: ['scoreRisk()', 'The rules decide'],
        highlights: [
          { lines: [177, 181], at: rules, until: decide },
          { lines: [193, 193], at: decide, until: explains - 0.2 },
        ],
      },
      {
        key: 'prompt',
        from: explains - 0.3,
        to: 99,
        badge: ['EXPLAIN_INSTRUCTIONS', 'The AI explains. It never decides.'],
        highlights: [
          { lines: [30, 30], at: explains, until: never },
          { lines: [31, 32], at: never, until: 99 },
        ],
      },
    ]
  },
})
