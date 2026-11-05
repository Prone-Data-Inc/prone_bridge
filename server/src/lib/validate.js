/* Reads and checks the query string or the JSON body of a request with a zod schema. A failure becomes a 400 that says
   which field was wrong. */
import { badRequest, unsupportedMediaType } from '#server/lib/errors.js'

const NUL = String.fromCharCode(0)

/* Postgres cannot keep a NUL character in text and answers with an error, which would surface as a 500. No screen sends
   one, so it is refused with the rest of the bad input, wherever it sits. */
function hasNul(value) {
  if (typeof value === 'string') return value.includes(NUL)
  if (Array.isArray(value)) return value.some(hasNul)
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, inner]) => key.includes(NUL) || hasNul(inner))
  }
  return false
}

function check(schema, input) {
  if (hasNul(input)) throw badRequest('Remove the unsupported characters and try again.')
  const parsed = schema.safeParse(input)
  if (parsed.success) return parsed.data
  const fields = Object.fromEntries(
    parsed.error.issues.map((issue) => [issue.path.join('.') || 'request', issue.message]),
  )
  throw badRequest('Check the request and try again.', fields)
}

export const parseQuery = (c, schema) => check(schema, c.req.query())

export const parseParams = (c, schema) => check(schema, c.req.param())

/* Only a body that says it is JSON is read. A web page on another site can send a plain text form body without asking the
   browser's permission first, and this refuses it before it is looked at. */
export async function parseBody(c, schema) {
  if (!/^application\/json\b/i.test(c.req.header('content-type') ?? '')) throw unsupportedMediaType()
  let body
  try {
    body = await c.req.json()
  } catch {
    throw badRequest('Send the request as JSON.')
  }
  return check(schema, body)
}
