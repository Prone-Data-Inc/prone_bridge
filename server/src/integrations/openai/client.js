/* The OpenAI Responses API, with only what ProneBridge uses: plain text, a reply in a fixed JSON shape, and tool calls.
   The shapes follow OpenAI's docs for POST /v1/responses and were checked against this account on 2026-11-05.
   The key is read from the environment and sent only to api.openai.com. Nothing is stored at OpenAI (store: false), and
   the key never appears in an error, a log line or a response. */

const ENDPOINT = 'https://api.openai.com/v1/responses'

/* An AI call that did not work. The message is safe to log. It is never shown to a person as it is. */
export class AiError extends Error {
  constructor(message, { status = 0, code = 'error', unreachable = false, timedOut = false } = {}) {
    super(message)
    this.name = 'AiError'
    this.status = status
    this.code = code
    this.unreachable = unreachable
    this.timedOut = timedOut
  }
}

/* The text the model wrote, whatever way the answer is split into items. */
function textOf(output) {
  return output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text ?? '')
    .join('')
}

const refusalOf = (output) =>
  output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .find((part) => part.type === 'refusal')?.refusal ?? null

export function createOpenAiClient({ config, fetchImpl = globalThis.fetch, timeoutMs = 25_000 }) {
  const enabled = Boolean(config.apiKey)

  /* model, input (messages and tool results), and then any of:
       tools + toolChoice     functions the model may call. Strict: every property listed, no extras.
       schema + schemaName    the answer must be JSON of this shape; the parsed object comes back as `parsed`.
       effort                 how much the model thinks first: none, low, medium, high.
       include                extra parts of the answer to ask for. With store off, a model that thinks needs
                              'reasoning.encrypted_content' so its thinking can be sent back with a tool result.
       timeoutMs              how long to wait for this call, when it should be shorter than the default.
     Answers { text, parsed, refusal, calls, output, usage, status, incomplete, model }. `output` is what to send back in
     `input` next time, together with the results of the calls. */
  async function respond({
    model,
    input,
    tools,
    toolChoice,
    schema,
    schemaName = 'answer',
    effort,
    include,
    maxOutputTokens = 800,
    timeoutMs: waitMs = timeoutMs,
  }) {
    if (!enabled) throw new AiError('The AI is not connected yet.', { code: 'not_configured' })

    const body = { model, input, store: false, max_output_tokens: maxOutputTokens }
    if (effort) body.reasoning = { effort }
    if (include?.length) body.include = include
    if (tools?.length) {
      body.tools = tools
      body.tool_choice = toolChoice ?? 'auto'
    }
    if (schema) body.text = { format: { type: 'json_schema', name: schemaName, strict: true, schema } }

    let response
    try {
      response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(waitMs),
      })
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
      throw new AiError(timedOut ? 'The AI took too long to answer.' : 'We could not reach the AI service.', {
        code: timedOut ? 'timeout' : 'unreachable',
        unreachable: true,
        timedOut,
      })
    }

    const json = await response.json().catch(() => null)
    if (!response.ok) {
      const code = json?.error?.code ?? json?.error?.type ?? 'error'
      throw new AiError(`The AI service refused the request (${response.status}, ${code}).`, {
        status: response.status,
        code,
      })
    }
    if (!json || !Array.isArray(json.output))
      throw new AiError('The AI service sent something unexpected.', { code: 'bad_output' })

    const text = textOf(json.output)
    let parsed = null
    if (schema && json.status === 'completed' && !refusalOf(json.output)) {
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new AiError('The AI answer was not in the shape we asked for.', { code: 'bad_output' })
      }
    }

    return {
      text,
      parsed,
      refusal: refusalOf(json.output),
      calls: json.output
        .filter((item) => item.type === 'function_call')
        .map((item) => ({ callId: item.call_id, name: item.name, arguments: item.arguments ?? '{}' })),
      output: json.output,
      usage: {
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      },
      status: json.status,
      incomplete: json.incomplete_details?.reason ?? null,
      model: json.model ?? model,
    }
  }

  return { enabled, models: config.models, respond }
}
