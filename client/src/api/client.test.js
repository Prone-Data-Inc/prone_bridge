// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from './client.js'

const answer = (status, body) => ({ ok: status < 400, status, json: async () => body })

afterEach(() => vi.unstubAllGlobals())

describe('request', () => {
  it('returns the data of a successful answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer(200, { data: { ok: true } })),
    )
    await expect(request('/ping')).resolves.toEqual({ ok: true })
    expect(fetch).toHaveBeenCalledWith('/api/ping', expect.objectContaining({ method: 'GET' }))
  })

  it('sends a body as JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer(201, { data: {} })),
    )
    await request('/things', { method: 'POST', body: { name: 'a' } })
    const [, init] = fetch.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(init.body).toBe('{"name":"a"}')
  })

  it('turns a failure into an ApiError with the status, code, message and request id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        answer(409, { error: { code: 'conflict', message: 'You already own this course.', requestId: 'r-1' } }),
      ),
    )
    const error = await request('/x').catch((caught) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 409,
      code: 'conflict',
      message: 'You already own this course.',
      requestId: 'r-1',
    })
  })

  it('keeps which field was wrong, so a form can show it', async () => {
    const details = { 'buyer.email': 'Enter a valid email.' }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer(400, { error: { code: 'bad_request', message: 'Check the request.', details } })),
    )
    const error = await request('/x', { method: 'POST', body: {} }).catch((caught) => caught)
    expect(error.details).toEqual(details)
  })

  it('has no details when the server sends none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer(404, { error: { code: 'not_found', message: 'Gone.' } })),
    )
    const error = await request('/x').catch((caught) => caught)
    expect(error.details).toBeUndefined()
  })

  it('uses a plain message when the answer is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 502, json: async () => Promise.reject(new Error('no')) })),
    )
    const error = await request('/x').catch((caught) => caught)
    expect(error).toMatchObject({ status: 502, code: 'error', message: 'Something went wrong. Try again.' })
  })

  it('says so when the server cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    )
    const error = await request('/x').catch((caught) => caught)
    expect(error).toMatchObject({ status: 0, code: 'network_error', message: 'We could not reach the server.' })
  })

  it('lets a cancelled request stay cancelled', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(abort)),
    )
    await expect(request('/x')).rejects.toBe(abort)
  })
})
