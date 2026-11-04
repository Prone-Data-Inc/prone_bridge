/* One place that turns a thrown error into the JSON the client expects. Known errors keep their status and message;
   anything unexpected is logged with its stack and answered with a plain 500 so no internals ever leak. */
import { HTTPException } from 'hono/http-exception'
import { AppError } from '#server/lib/errors.js'
import { errorBody } from '#server/lib/response.js'

const HTTP_CODES = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  429: 'rate_limited',
}

export function createErrorHandler({ logger }) {
  return (error, c) => {
    const scoped = c.get('logger') ?? logger

    if (error instanceof AppError) {
      return c.json(errorBody(c, error.code, error.message, error.details), error.status)
    }

    if (error instanceof HTTPException && error.status < 500) {
      return c.json(
        errorBody(c, HTTP_CODES[error.status] ?? 'bad_request', error.message || 'The request could not be handled.'),
        error.status,
      )
    }

    scoped.error('unhandled error', { error: error.message, stack: error.stack })
    return c.json(errorBody(c, 'internal_error', 'Something went wrong. Try again.'), 500)
  }
}

export function notFoundHandler(c) {
  return c.json(errorBody(c, 'not_found', 'We could not find that.'), 404)
}
