/* Gives every request an id (kept when the caller sends a sane x-request-id), a logger that carries it, and one access
   log line when the response is ready. The id is returned in the x-request-id header and inside every error body. */
const SAFE_ID = /^[\w-]{8,64}$/

export function requestContext({ logger }) {
  return async (c, next) => {
    const incoming = c.req.header('x-request-id')
    const requestId = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID()
    const scoped = logger.child({ requestId })
    c.set('requestId', requestId)
    c.set('logger', scoped)
    c.header('x-request-id', requestId)

    const started = performance.now()
    await next()

    const level = c.req.path === '/api/health' ? 'debug' : 'info'
    scoped[level]('request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - started),
    })
  }
}
