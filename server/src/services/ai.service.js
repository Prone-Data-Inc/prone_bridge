/* The one door to the AI. Every call goes through here, so every call is counted. The app has a budget of tokens for
   each day (UTC). Past it, the AI pauses: the copilot says so, and risk explanations fall back to the rules' own words.
   A call that fails is logged without its prompt, and the caller decides what to do without the AI. */
import { AppError, badGateway, unavailable } from '#server/lib/errors.js'
import { AiError } from '#server/integrations/openai/client.js'

const startOfDay = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))

/* AI text goes on screen, where long dashes are never used. The two characters are built, so none sits in this file. */
const LONG_DASHES = new RegExp(`\\s*[${String.fromCharCode(0x2013, 0x2014)}]\\s*`, 'g')
export const cleanText = (text) => text.replace(LONG_DASHES, ', ').trim()

export function createAiService({ client, db, env, logger, now = () => new Date() }) {
  const budget = env.ai.dailyTokenBudget

  async function usedToday() {
    if (!db) return 0
    const [row] = await db.query(
      'select coalesce(sum(input_tokens + output_tokens), 0)::bigint as used from public.ai_usage where created_at >= $1',
      [startOfDay(now()).toISOString()],
    )
    return Number(row.used)
  }

  return {
    enabled: client.enabled,
    models: client.models,

    async status() {
      const used = client.enabled ? await usedToday() : 0
      return {
        enabled: client.enabled,
        models: client.models,
        dailyTokenBudget: budget,
        usedTokens: used,
        remainingTokens: Math.max(0, budget - used),
      }
    },

    /* One call to the model. feature names what it is for (it is kept with the count). Throws an AppError a person can be
       told about: the AI is off, the budget for today is used up, or the service did not answer well. */
    async run(feature, request, { merchantId = null } = {}) {
      if (!client.enabled) throw unavailable('The AI is not connected yet.')
      if ((await usedToday()) >= budget) {
        throw new AppError(429, 'ai_budget', 'The AI has reached its limit for today. It starts again at midnight UTC.')
      }

      let result
      try {
        result = await client.respond(request)
      } catch (error) {
        if (!(error instanceof AiError)) throw error
        logger?.warn('ai call failed', { feature, status: error.status, code: error.code, timedOut: error.timedOut })
        throw error.timedOut || error.unreachable
          ? unavailable('The AI could not be reached. Try again in a moment.')
          : badGateway('The AI could not answer that. Try again.')
      }

      await db?.query(
        'insert into public.ai_usage (feature, model, input_tokens, output_tokens, merchant_id) values ($1, $2, $3, $4, $5)',
        [feature, result.model, result.usage.inputTokens, result.usage.outputTokens, merchantId],
      )
      return result
    },
  }
}
