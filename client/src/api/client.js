/* The one way the web app talks to the API. Success answers { data }, failure answers { error }; both are unwrapped here
   so screens only deal with data or an ApiError. */
export class ApiError extends Error {
  /* details, when the server sends it, says which field was wrong: { 'buyer.email': 'Enter a valid email.' } */
  constructor(status, code, message, requestId, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.details = details
  }
}

export async function request(path, { method = 'GET', body, signal } = {}) {
  let response
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new ApiError(0, 'network_error', 'We could not reach the server.')
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const failure = payload?.error
    throw new ApiError(
      response.status,
      failure?.code ?? 'error',
      failure?.message ?? 'Something went wrong. Try again.',
      failure?.requestId,
      failure?.details,
    )
  }
  return payload?.data
}
