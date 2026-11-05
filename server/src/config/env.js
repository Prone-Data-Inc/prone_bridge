/* Environment, read once and validated. Every integration key is optional: a missing key switches that feature off
   and the health route says so, it never crashes the app. A malformed value (a port that is not a number, PayPal set
   to anything but sandbox) fails fast with a readable message.
   The app reaches the database with DATABASE_URL only. It never needs the Supabase service role key. */
import { z } from 'zod'

const text = z.string().default('')
const flag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8000),
  APP_URL: z.url().default('http://localhost:5173'),
  SERVE_CLIENT: flag,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),

  /* Postgres on Supabase. Local and migration runs can use the direct address; Vercel needs the transaction pooler. */
  DATABASE_URL: text,
  /* Supabase's CA certificate, as PEM text or as a path to the file. The connection is always verified. */
  DATABASE_SSL_CA: text,
  DATABASE_SSL_CA_FILE: text,
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(20).optional(),

  /* This project never talks to live PayPal. */
  PAYPAL_ENV: z.literal('sandbox').default('sandbox'),
  PAYPAL_CLIENT_ID: text,
  PAYPAL_CLIENT_SECRET: text,
  PAYPAL_WEBHOOK_ID: text,
  /* The sandbox account that receives payouts. Without it, payouts stay simulated. */
  PAYPAL_PAYOUT_EMAIL: z.email().optional(),

  OPENAI_API_KEY: text,
  OPENAI_MODEL_AGENT: z.string().min(1).default('gpt-6.1-sol'),
  OPENAI_MODEL_FAST: z.string().min(1).default('gpt-6-luna'),
  AI_DAILY_LIMIT: z.coerce.number().int().min(1000).max(50_000_000).default(600_000),
})

export class EnvError extends Error {
  constructor(issues) {
    super(
      `Invalid environment:\n${issues.map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n')}`,
    )
    this.name = 'EnvError'
    this.issues = issues
  }
}

/* A blank value in a .env file (KEY=) counts as not set, so the default applies. */
const withoutBlanks = (source) =>
  Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined && value !== ''))

export function loadEnv(source = process.env) {
  const parsed = schema.safeParse(withoutBlanks(source))
  if (!parsed.success) throw new EnvError(parsed.error.issues)
  const e = parsed.data

  return Object.freeze({
    nodeEnv: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    /* Vercel sets VERCEL on every function: each instance keeps a single database connection there. */
    isServerless: Boolean(source.VERCEL),
    host: e.HOST,
    port: e.PORT,
    appUrl: e.APP_URL,
    serveClient: e.SERVE_CLIENT,
    logLevel: e.LOG_LEVEL,
    database: Object.freeze({
      url: e.DATABASE_URL,
      sslCa: e.DATABASE_SSL_CA,
      sslCaFile: e.DATABASE_SSL_CA_FILE,
      poolMax: e.DATABASE_POOL_MAX,
    }),
    paypal: Object.freeze({
      env: e.PAYPAL_ENV,
      clientId: e.PAYPAL_CLIENT_ID,
      clientSecret: e.PAYPAL_CLIENT_SECRET,
      webhookId: e.PAYPAL_WEBHOOK_ID,
      payoutEmail: e.PAYPAL_PAYOUT_EMAIL ?? '',
    }),
    ai: Object.freeze({
      apiKey: e.OPENAI_API_KEY,
      models: Object.freeze({ agent: e.OPENAI_MODEL_AGENT, fast: e.OPENAI_MODEL_FAST }),
      dailyTokenBudget: e.AI_DAILY_LIMIT,
    }),
    /* A key being present is not a live connection. Each integration reports its real status once it exists. */
    integrations: Object.freeze({
      database: Boolean(e.DATABASE_URL),
      paypal: Boolean(e.PAYPAL_CLIENT_ID && e.PAYPAL_CLIENT_SECRET),
      ai: Boolean(e.OPENAI_API_KEY),
    }),
  })
}

let cached
export const getEnv = () => (cached ??= loadEnv())
