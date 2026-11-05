/* Writes a seed data set to the database, and clears it again. Broadcast triggers are paused while seeding, so a
   thousand rows do not become a thousand live signals. */
import { SEED_TABLES } from './build.js'

const CHUNK = 400
const COLUMN = /^[a-z][a-z0-9_]*$/
const BROADCAST = [
  ['payments', 'payments_broadcast'],
  ['notifications', 'notifications_broadcast'],
  ['payouts', 'payouts_broadcast'],
]

async function insertRows(t, table, rows) {
  if (!rows.length) return
  const columns = Object.keys(rows[0])
  if (!COLUMN.test(table) || !columns.every((column) => COLUMN.test(column)))
    throw new Error(`Unsafe seed identifier in ${table}`)
  const list = columns.join(', ')
  for (let i = 0; i < rows.length; i += CHUNK) {
    await t.query(
      `insert into public.${table} (${list}) select ${list} from jsonb_populate_recordset(null::public.${table}, $1::jsonb)`,
      [JSON.stringify(rows.slice(i, i + CHUNK))],
    )
  }
}

/* Writes the data set inside a transaction the caller already holds. Counts per table, so a caller can report what was
   written. */
export async function writeSeed(t, dataset) {
  for (const [table, trigger] of BROADCAST) await t.exec(`alter table public.${table} disable trigger ${trigger}`)
  const counts = {}
  for (const table of SEED_TABLES) {
    await insertRows(t, table, dataset[table])
    counts[table] = dataset[table].length
  }
  for (const [table, trigger] of BROADCAST) await t.exec(`alter table public.${table} enable trigger ${trigger}`)
  return counts
}

export const applySeed = (db, dataset) => db.tx((t) => writeSeed(t, dataset))

/* The statement that removes all demo data and live data. The schema and the migration history stay. Cascade also empties
   the tables that point at these ones: risk ratings, payment links, copilot changes and the AI usage count. */
export const CLEAR_SQL = `truncate table ${[...SEED_TABLES]
  .reverse()
  .map((table) => `public.${table}`)
  .join(', ')} restart identity cascade`

export async function clearData(db) {
  await db.exec(CLEAR_SQL)
}

export async function hasData(db) {
  const [row] = await db.query('select count(*)::int as merchants from public.merchants')
  return row.merchants > 0
}
