/* Fairness, tested as an experiment and not only promised. A buyer's country, name and language must never move a risk
   score. Three ways of checking it:
     1. Shuffle the country of every payment and every buyer in the demo history, score it all again, and compare. Not one
        score may change. A second experiment changes a real signal and shows that scores DO move, so the first one is not
        passing because nothing could ever change.
     2. Run the same behaviour from every country through the live checkout. The same decision, the same score.
     3. Read the code that scores, with its comments removed, and find no country, name or language in it. */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'
import { loadEnv } from './config/env.js'
import { migrate } from './db/migrate.js'
import { applySeed } from './db/seed/apply.js'
import { buildSeed } from './db/seed/build.js'
import { createTestDb } from './db/testing.js'
import { createLogger } from './lib/logger.js'
import { createRiskService } from './services/risk.service.js'

const logger = createLogger({ level: 'silent' })
const env = loadEnv({ NODE_ENV: 'test', OPENAI_API_KEY: ['test', 'key'].join('-') })

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
/* Code without its comments, so what a comment says about country does not count and what the code does cannot hide. */
const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('shuffling who and where the buyers are', () => {
  let db
  let risk
  let before

  /* Every payment's rating as one comparable line. */
  const ratings = async () =>
    new Map(
      (
        await db.query(
          `select payment_id, score, level, decision, (select string_agg(s->>'id', ',' order by s->>'id') from jsonb_array_elements(signals) s) as rules
             from public.risk_assessments`,
        )
      ).map((row) => [row.payment_id, `${row.score}|${row.level}|${row.decision}|${row.rules ?? ''}`]),
    )

  async function rescore() {
    await db.query('delete from public.risk_assessments')
    return risk.scoreHistory()
  }

  beforeAll(async () => {
    db = await createTestDb()
    await migrate(db)
    await applySeed(db, buildSeed({ now: new Date('2026-11-04T12:00:00Z') }))
    risk = createRiskService({ db, ai: { enabled: false } })
    await risk.scoreHistory()
    before = await ratings()
  }, 60_000)
  afterAll(() => db.close())

  it('has a real history to test on: more than a thousand payments from every country', async () => {
    expect(before.size).toBeGreaterThan(1000)
    const countries = (await db.query('select count(distinct country_code)::int as n from public.payments'))[0].n
    expect(countries).toBe(10)
  })

  it('does not change one score when every payment and every buyer is moved to a random country', async () => {
    await db.query(
      `update public.payments p set country_code =
         (select c.code from public.countries c order by md5(c.code || p.id::text || 'shuffle') limit 1)`,
    )
    await db.query(
      `update public.buyers b set country_code =
         (select c.code from public.countries c order by md5(c.code || b.id::text || 'shuffle') limit 1)`,
    )
    const moved = (
      await db.query(
        'select count(*)::int as n from public.payments p join public.risk_assessments r on r.payment_id = p.id',
      )
    )[0].n
    expect(moved).toBe(before.size)

    expect(await rescore()).toBe(before.size)
    const after = await ratings()
    expect(after.size).toBe(before.size)
    const changed = [...before].filter(([id, line]) => after.get(id) !== line)
    expect(changed).toEqual([])
  }, 60_000)

  it('did move the payments, so the shuffle was a real one', async () => {
    const seed = buildSeed({ now: new Date('2026-11-04T12:00:00Z') })
    const original = new Map(seed.payments.map((payment) => [payment.id, payment.country_code]))
    const now = new Map(
      (await db.query('select id, country_code from public.payments')).map((row) => [row.id, row.country_code]),
    )
    const moved = [...original].filter(([id, code]) => now.get(id) !== code).length
    expect(moved / original.size).toBeGreaterThan(0.7)
  })

  it('does not change one score when every buyer is renamed and given another language of email address', async () => {
    await db.query(
      `update public.buyers set full_name = 'Buyer ' || substr(md5(id::text), 1, 8),
              email = substr(md5(email), 1, 12) || '@' || split_part(email, '@', 2)`,
    )
    await rescore()
    const after = await ratings()
    expect([...before].filter(([id, line]) => after.get(id) !== line)).toEqual([])
  }, 60_000)

  it('DOES change scores when a signal that counts changes, so the experiment above can fail', async () => {
    /* A throwaway email is a real signal. Give it to some buyers and their scores must go up by exactly its points. */
    const victims = (await db.query('select id from public.buyers order by id limit 40')).map((row) => row.id)
    await db.query(
      "update public.buyers set email = substr(md5(email), 1, 12) || '@mailinator.com' where id = any($1::uuid[])",
      [victims],
    )
    await rescore()
    const after = await ratings()
    const touched = new Set(
      (await db.query('select id from public.payments where buyer_id = any($1::uuid[])', [victims])).map(
        (row) => row.id,
      ),
    )
    expect(touched.size).toBeGreaterThan(40)
    const changed = [...before].filter(([id, line]) => after.get(id) !== line).map(([id]) => id)
    expect(changed.length).toBeGreaterThan(0)
    /* only the payments of those buyers moved, and each gained the rule */
    expect(changed.every((id) => touched.has(id))).toBe(true)
    expect([...touched].every((id) => after.get(id).includes('throwaway_email'))).toBe(true)
  }, 60_000)
})

describe('the same behaviour from every country, through the live checkout', () => {
  let db
  let app
  let countries

  beforeAll(async () => {
    db = await createTestDb()
    await migrate(db)
    await applySeed(db, buildSeed({ now: new Date('2026-11-04T12:00:00Z') }))
    const openai = {
      enabled: true,
      models: { agent: 'a', fast: 'f' },
      respond: vi.fn(async () => ({
        text: '{"explanation":"The signals suggest a throwaway address."}',
        parsed: { explanation: 'The signals suggest a throwaway address.' },
        refusal: null,
        calls: [],
        output: [],
        usage: { inputTokens: 1, outputTokens: 1 },
        status: 'completed',
        incomplete: null,
        model: 'f',
      })),
    }
    app = createApp({ env, logger, db, openai })
    /* a method the seller really takes in each country */
    countries = await db.query(
      `select distinct on (cm.country_code) cm.country_code as code, cm.method_id as method
         from public.country_methods cm
         join public.merchant_methods mm on mm.country_code = cm.country_code and mm.method_id = cm.method_id and mm.enabled
         join public.merchants m on m.id = mm.merchant_id and m.slug = 'pdl'
         join public.payment_methods pm on pm.id = cm.method_id and pm.provider = 'simulated'
        order by cm.country_code, cm.sort`,
    )
  }, 60_000)
  afterAll(() => db.close())

  let address = 0
  const post = async (path, body) => {
    address += 1
    const response = await app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.1.${address >> 8}.${address & 255}` },
      body: JSON.stringify(body),
    })
    return (await response.json()).data
  }
  /* What other buyers did a moment ago can add a burst to a payment. That is about time, not country, so each payment is made
     with everyone else's recent payments aged by a day, and only the buyer's own history left in place. */
  const pay = async (country, email) => {
    await db.query(
      "update public.payments p set created_at = created_at - interval '1 day' where created_at > now() - interval '10 minutes' and buyer_id not in (select id from public.buyers where lower(email) = lower($1))",
      [email],
    )
    return post('/api/checkout/payments', {
      idempotencyKey: randomUUID(),
      product: 'ai-for-work',
      country: country.code,
      method: country.method,
      buyer: { name: 'Same Person', email },
    })
  }
  const ratingOf = async (paymentId) => {
    const [row] = await db.query('select score, level, decision from public.risk_assessments where payment_id = $1', [
      paymentId,
    ])
    return `${row.score}|${row.level}|${row.decision}`
  }

  it('covers every country the seller serves', () => {
    expect(countries.length).toBeGreaterThanOrEqual(9)
  })

  it('treats an ordinary buyer the same in every country: low, and let through', async () => {
    const results = []
    for (const country of countries) {
      const { payment } = await pay(country, `calm.${country.code}.${randomUUID().slice(0, 8)}@example.com`)
      results.push(`${await ratingOf(payment.id)}|${payment.status}`)
    }
    expect(new Set(results).size).toBe(1)
    expect(results[0]).toBe('0|low|allow|processing')
  }, 60_000)

  it('holds a throwaway email the same way in every country: 40, medium, in review', async () => {
    const results = []
    for (const country of countries) {
      const { payment } = await pay(country, `risky.${country.code}.${randomUUID().slice(0, 8)}@mailinator.com`)
      results.push(`${await ratingOf(payment.id)}|${payment.status}`)
    }
    expect(new Set(results).size).toBe(1)
    expect(results[0]).toBe('40|medium|review|in_review')
  }, 60_000)

  it('blocks a bot the same way in every country: the same four scores', async () => {
    const sequences = []
    for (const country of countries) {
      const email = `bot.${country.code}.${randomUUID().slice(0, 8)}@mailinator.com`
      const seen = []
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const { payment } = await pay(country, email)
        seen.push(`${(await ratingOf(payment.id)).split('|')[0]}:${payment.status}`)
      }
      sequences.push(seen.join(' '))
    }
    expect(new Set(sequences).size).toBe(1)
    expect(sequences[0]).toBe('40:in_review 40:in_review 40:in_review 60:blocked')
  }, 120_000)
})

describe('the code that scores', () => {
  const WORDS =
    /country|countrycode|nationality|ethnic|language|locale|phone|region|\bname\b|fullname|full_name|currency/i

  it("names no country, name, language or phone in the engine's code, once its comments, its texts and its refusal pattern are set aside", () => {
    const code = withoutComments(source('./lib/risk.js'))
      /* what the engine says to a person is not what it does: texts are set aside, and the pattern that refuses these words */
      .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""')
      .replace(/const FORBIDDEN = .*\n/, '')
    expect(code.length).toBeGreaterThan(1000)
    expect(code.match(WORDS)).toBeNull()
  })

  it("names none in the query that counts a buyer's behaviour", () => {
    const text = source('./repositories/risk.repository.js')
    const query = withoutComments(text.slice(text.indexOf('async signals('), text.indexOf('async insertAssessment(')))
    expect(query.length).toBeGreaterThan(500)
    expect(query.match(WORDS)).toBeNull()
  })

  it('picks only named fields out of a payment before scoring it', () => {
    const text = source('./services/risk.service.js')
    const body = withoutComments(
      text.slice(text.indexOf('async function scoreFor('), text.indexOf('/* The notifications a decision sends')),
    )
    expect(body.match(WORDS)).toBeNull()
    /* it reads exactly these, and spreads nothing from the payment */
    expect(body).toContain('payment.buyerId')
    expect(body).toContain('payment.merchantId')
    expect(body).toContain('payment.methodId')
    expect(body).toContain('payment.email')
    expect(body).toContain('payment.amountUsdCents')
    expect(body).not.toMatch(/\.\.\.payment\b/)
  })

  it('has the checkout call the gate without a country', () => {
    const text = withoutComments(source('./services/checkout.service.js'))
    const call = text.slice(text.indexOf('risk.gate('), text.indexOf('risk.gate(') + 300)
    expect(call.match(WORDS)).toBeNull()
  })
})
