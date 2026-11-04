/* Reads and checks the query string or the JSON body of a request with a zod schema. A failure becomes a 400 that says
   which field was wrong. */
import { badRequest } from '#server/lib/errors.js'

function check(schema, input) {
  const parsed = schema.safeParse(input)
  if (parsed.success) return parsed.data
  const fields = Object.fromEntries(
    parsed.error.issues.map((issue) => [issue.path.join('.') || 'request', issue.message]),
  )
  throw badRequest('Check the request and try again.', fields)
}

export const parseQuery = (c, schema) => check(schema, c.req.query())

export const parseParams = (c, schema) => check(schema, c.req.param())

export async function parseBody(c, schema) {
  let body
  try {
    body = await c.req.json()
  } catch {
    throw badRequest('Send the request as JSON.')
  }
  return check(schema, body)
}
