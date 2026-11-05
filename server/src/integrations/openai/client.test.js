/* The OpenAI client against a stand-in for the network: the request it sends, and every way an answer can come back. */
import { describe, expect, it, vi } from 'vitest'
import { AiError, createOpenAiClient } from './client.js'

/* Built at run time so the test file holds no key-shaped text. */
const KEY = ['test', 'key', 'not', 'real'].join('-')
const config = { apiKey: KEY, models: { agent: 'agent-model', fast: 'fast-model' } }

const reply = (body, init = {}) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init }),
  )

const completed = (output, extra = {}) => ({
  status: 'completed',
  model: 'fast-model',
  output,
  usage: { input_tokens: 12, output_tokens: 7 },
  ...extra,
})
const message = (text) => ({ type: 'message', content: [{ type: 'output_text', text }] })

describe('openai client', () => {
  it('is off without a key, and says so before it calls anything', async () => {
    const fetchImpl = vi.fn()
    const client = createOpenAiClient({ config: { ...config, apiKey: '' }, fetchImpl })
    expect(client.enabled).toBe(false)
    await expect(client.respond({ model: 'm', input: [] })).rejects.toMatchObject({ code: 'not_configured' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sends the documented request: store off, reasoning effort, token cap, the key only in the header', async () => {
    const fetchImpl = vi.fn(() => reply(completed([message('Hello')])))
    const client = createOpenAiClient({ config, fetchImpl })
    const result = await client.respond({
      model: 'fast-model',
      input: [{ role: 'user', content: 'Hi' }],
      effort: 'none',
      maxOutputTokens: 123,
    })

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`)
    const body = JSON.parse(init.body)
    expect(body).toEqual({
      model: 'fast-model',
      input: [{ role: 'user', content: 'Hi' }],
      store: false,
      max_output_tokens: 123,
      reasoning: { effort: 'none' },
    })
    expect(init.body).not.toContain(KEY)
    expect(result).toMatchObject({ text: 'Hello', usage: { inputTokens: 12, outputTokens: 7 }, status: 'completed' })
  })

  it('asks for a JSON answer in a fixed shape, and hands back the parsed object', async () => {
    const schema = {
      type: 'object',
      properties: { level: { type: 'string' } },
      required: ['level'],
      additionalProperties: false,
    }
    const fetchImpl = vi.fn(() => reply(completed([message('{"level":"medium"}')])))
    const client = createOpenAiClient({ config, fetchImpl })
    const result = await client.respond({ model: 'm', input: [], schema, schemaName: 'risk_note' })

    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).text).toEqual({
      format: { type: 'json_schema', name: 'risk_note', strict: true, schema },
    })
    expect(result.parsed).toEqual({ level: 'medium' })
  })

  it('refuses an answer that is not the JSON it asked for', async () => {
    const client = createOpenAiClient({ config, fetchImpl: () => reply(completed([message('not json')])) })
    await expect(client.respond({ model: 'm', input: [], schema: { type: 'object' } })).rejects.toMatchObject({
      code: 'bad_output',
    })
  })

  it('passes the tools along and reads the calls the model makes', async () => {
    const tools = [
      { type: 'function', name: 'get_overview', description: 'x', parameters: { type: 'object' }, strict: true },
    ]
    const fetchImpl = vi.fn(() =>
      reply(
        completed([
          { type: 'function_call', call_id: 'call_1', name: 'get_overview', arguments: '{"days":7}' },
          { type: 'function_call', call_id: 'call_2', name: 'get_links' },
        ]),
      ),
    )
    const client = createOpenAiClient({ config, fetchImpl })
    const result = await client.respond({ model: 'm', input: [], tools })

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.tools).toEqual(tools)
    expect(body.tool_choice).toBe('auto')
    expect(result.calls).toEqual([
      { callId: 'call_1', name: 'get_overview', arguments: '{"days":7}' },
      { callId: 'call_2', name: 'get_links', arguments: '{}' },
    ])
    expect(result.output).toHaveLength(2)
  })

  it('reports a refusal and an answer cut short instead of pretending they are fine', async () => {
    const refused = createOpenAiClient({
      config,
      fetchImpl: () => reply(completed([{ type: 'message', content: [{ type: 'refusal', refusal: 'No.' }] }])),
    })
    expect((await refused.respond({ model: 'm', input: [], schema: { type: 'object' } })).refusal).toBe('No.')

    const cut = createOpenAiClient({
      config,
      fetchImpl: () =>
        reply(
          completed([message('Half an ans')], {
            status: 'incomplete',
            incomplete_details: { reason: 'max_output_tokens' },
          }),
        ),
    })
    expect(await cut.respond({ model: 'm', input: [] })).toMatchObject({
      status: 'incomplete',
      incomplete: 'max_output_tokens',
    })
  })

  it('turns an error answer into an AiError that never carries the key or the prompt', async () => {
    const client = createOpenAiClient({
      config,
      fetchImpl: () =>
        reply(
          { error: { type: 'invalid_request_error', code: 'model_not_found', message: `bad ${KEY}` } },
          { status: 404 },
        ),
    })
    const error = await client
      .respond({ model: 'm', input: [{ role: 'user', content: 'secret prompt' }] })
      .catch((e) => e)
    expect(error).toBeInstanceOf(AiError)
    expect(error).toMatchObject({ status: 404, code: 'model_not_found' })
    expect(error.message).not.toContain(KEY)
    expect(error.message).not.toContain('secret prompt')
  })

  it('tells a timeout and an unreachable network apart', async () => {
    const slow = createOpenAiClient({
      config,
      fetchImpl: () => Promise.reject(Object.assign(new Error('x'), { name: 'TimeoutError' })),
    })
    expect(await slow.respond({ model: 'm', input: [] }).catch((e) => e)).toMatchObject({
      code: 'timeout',
      timedOut: true,
      unreachable: true,
    })

    const down = createOpenAiClient({ config, fetchImpl: () => Promise.reject(new TypeError('fetch failed')) })
    expect(await down.respond({ model: 'm', input: [] }).catch((e) => e)).toMatchObject({
      code: 'unreachable',
      timedOut: false,
      unreachable: true,
    })
  })

  it('rejects an answer without an output list', async () => {
    const client = createOpenAiClient({ config, fetchImpl: () => reply({ status: 'completed' }) })
    await expect(client.respond({ model: 'm', input: [] })).rejects.toMatchObject({ code: 'bad_output' })
  })
})
