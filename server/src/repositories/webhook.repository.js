/* The webhook inbox: each event PayPal sends is written once, by its id, with how it went. */
export function createWebhookRepository({ db }) {
  return {
    /* Writes the event, or counts a repeat delivery. Answers the status the event is in. */
    async receive({ id, eventType, resourceType }) {
      const [row] = await db.query(
        `insert into public.webhook_events (id, event_type, resource_type) values ($1, $2, $3)
         on conflict (id) do update set attempts = public.webhook_events.attempts + 1
         returning status`,
        [id, eventType, resourceType ?? null],
      )
      return row.status
    },

    async finish(id, status, error = null) {
      await db.query('update public.webhook_events set status = $2, error = $3, processed_at = now() where id = $1', [
        id,
        status,
        error,
      ])
    },
  }
}
