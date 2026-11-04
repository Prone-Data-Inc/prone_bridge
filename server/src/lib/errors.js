/* Errors the API throws on purpose. Each carries the HTTP status, a stable code the client can switch on, and a short
   message that is safe to show a person. Anything else is an unexpected failure and is answered with a generic 500. */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (message = 'Check what you entered and try again.', details) =>
  new AppError(400, 'bad_request', message, details)
export const unauthorized = (message = 'Sign in to continue.') => new AppError(401, 'unauthorized', message)
export const forbidden = (message = 'You cannot do that.') => new AppError(403, 'forbidden', message)
export const notFound = (message = 'We could not find that.') => new AppError(404, 'not_found', message)
export const conflict = (message = 'That already happened.') => new AppError(409, 'conflict', message)
export const payloadTooLarge = (message = 'That request is too large.') =>
  new AppError(413, 'payload_too_large', message)
export const tooManyRequests = (message = 'Too many requests. Try again shortly.') =>
  new AppError(429, 'rate_limited', message)
export const unavailable = (message = 'This is not available yet.') => new AppError(503, 'unavailable', message)
