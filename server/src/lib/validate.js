/* Reads and checks the query string of a request with a zod schema. A failure becomes a 400 that says which field. */
import { badRequest } from '#server/lib/errors.js'

export function parseQuery(c, schema) {
  const parsed = schema.safeParse(c.req.query())
  if (parsed.success) return parsed.data
  const fields = Object.fromEntries(
    parsed.error.issues.map((issue) => [issue.path.join('.') || 'query', issue.message]),
  )
  throw badRequest('Check the request and try again.', fields)
}
