/* Database commands, run with npm:
     npm run db:status           which migrations are applied
     npm run db:migrate          apply the ones that are not
     npm run db:seed             write the demo data (only into an empty database)
     npm run db:reset            erase everything in the app tables, then seed again (asks for --yes)
     npm run db:risk             score every payment the risk rules have not scored yet (the seed does this itself)
     npm run db:check            end to end check of a Supabase project: connection, schema, security, live signals
   Reads DATABASE_URL (and the CA certificate settings) from .env. */
import { loadDotenv } from '#server/config/dotenv.js'
import { loadEnv } from '#server/config/env.js'
import { createRiskService } from '#server/services/risk.service.js'
import { createDb } from './client.js'
import { migrate, migrationStatus } from './migrate.js'
import { applySeed, clearData, hasData } from './seed/apply.js'
import { buildSeed } from './seed/build.js'
import { runChecks } from './check.js'

loadDotenv()

const [command = 'status', ...flags] = process.argv.slice(2)
const say = (message) => console.log(`[db] ${message}`)
const fail = (message) => {
  console.error(`[db] ${message}`)
  process.exit(1)
}

const env = loadEnv()
if (!env.database.url) fail('DATABASE_URL is not set. Add it to .env first.')

let db
try {
  db = createDb({ database: env.database, isServerless: false })
} catch (error) {
  fail(error.message)
}

/* Scores the demo history with the same rules that score a live payment. Nothing is sent to the AI. */
const scoreHistory = async () => {
  const scored = await createRiskService({ db, ai: { enabled: false } }).scoreHistory()
  say(`risk rules scored ${scored} payment${scored === 1 ? '' : 's'}`)
}

/* A TLS or network problem should read as one clear line, not a stack trace. */
const explain = (error) => {
  const source = error.cause ?? error
  if (/certificate|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(source.message + (source.code ?? ''))) {
    return "The database certificate could not be verified. Download Supabase's CA certificate (Project settings, Database, SSL configuration), save it as certs/supabase-ca.crt and set DATABASE_SSL_CA_FILE=certs/supabase-ca.crt in .env."
  }
  return source.message
}

try {
  if (command === 'status') {
    for (const item of await migrationStatus(db))
      say(
        `${item.version} ${item.name}: ${item.changed ? 'CHANGED after it was applied' : item.applied ? 'applied' : 'pending'}`,
      )
  } else if (command === 'migrate') {
    const done = await migrate(db, { log: say })
    say(
      done.length
        ? `applied ${done.length} migration${done.length === 1 ? '' : 's'}`
        : 'nothing to apply, the schema is up to date',
    )
  } else if (command === 'seed') {
    if (await hasData(db)) fail('The database already has data. Run npm run db:reset -- --yes to start over.')
    const counts = await applySeed(db, buildSeed())
    say(
      `seeded: ${Object.entries(counts)
        .map(([table, n]) => `${table} ${n}`)
        .join(', ')}`,
    )
    await scoreHistory()
  } else if (command === 'risk') {
    await scoreHistory()
  } else if (command === 'reset') {
    if (!flags.includes('--yes'))
      fail('This erases all payments, buyers and merchants in the database. Run it again with --yes to confirm.')
    await clearData(db)
    const counts = await applySeed(db, buildSeed())
    say(
      `reset and seeded: ${Object.entries(counts)
        .map(([table, n]) => `${table} ${n}`)
        .join(', ')}`,
    )
    await scoreHistory()
  } else if (command === 'check') {
    const ok = await runChecks({ db, say, env: process.env })
    process.exitCode = ok ? 0 : 1
  } else {
    fail(`Unknown command "${command}". Use status, migrate, seed, reset, risk or check.`)
  }
} catch (error) {
  fail(explain(error))
} finally {
  await db.close()
}
