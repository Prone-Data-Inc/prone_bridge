import { ok } from '#server/lib/response.js'

export const createWebhookController = ({ webhookService }) => ({
  /* The body is read as text: PayPal signs those exact bytes. */
  paypal: async (c) =>
    ok(
      c,
      await webhookService.receive({
        rawBody: await c.req.text(),
        header: (name) => c.req.header(name) ?? '',
      }),
    ),
})
