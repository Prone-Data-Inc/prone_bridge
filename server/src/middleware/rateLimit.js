/* Fixed window rate limit per caller address. The counters live in memory, so on Vercel each warm instance counts on
   its own: this is a guard against loops and casual abuse, not a quota. Paid resources (the AI) get a stricter budget
   kept in the database later. */
import { clientIp } from '#server/lib/http.js'
import { tooManyRequests } from '#server/lib/errors.js'

const MAX_TRACKED = 5000

export function rateLimit({ name = 'api', windowMs = 60_000, max = 120, now = Date.now, store = new Map() } = {}) {
  return async (c, next) => {
    const key = `${name}:${clientIp(c)}`
    const time = now()
    let entry = store.get(key)
    if (!entry || entry.resetAt <= time) {
      entry = { count: 0, resetAt: time + windowMs }
      store.set(key, entry)
    }
    entry.count += 1

    const resetIn = Math.max(1, Math.ceil((entry.resetAt - time) / 1000))
    c.header('RateLimit-Limit', String(max))
    c.header('RateLimit-Remaining', String(Math.max(0, max - entry.count)))
    c.header('RateLimit-Reset', String(resetIn))

    if (store.size > MAX_TRACKED) {
      for (const [stored, value] of store) if (value.resetAt <= time) store.delete(stored)
    }

    if (entry.count > max) {
      c.header('Retry-After', String(resetIn))
      throw tooManyRequests()
    }
    await next()
  }
}
