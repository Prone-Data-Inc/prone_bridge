/* Applies the SQL files in server/db/migrations in order, each in its own transaction, and remembers them in
   public.schema_migrations with a checksum. A file that was already applied and has changed since is refused: write a
   new migration instead of editing an old one. */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '#server/config/dotenv.js'

export const MIGRATIONS_DIR = join(ROOT, 'server', 'db', 'migrations')

const FILE = /^(\d{4})_([a-z0-9_]+)\.sql$/

export class MigrationError extends Error {}

export function readMigrations(dir = MIGRATIONS_DIR) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => {
      const match = FILE.exec(name)
      if (!match) throw new MigrationError(`Migration file names look like 0001_name.sql, not ${name}.`)
      const sql = readFileSync(join(dir, name), 'utf8')
      return {
        version: match[1],
        name: match[2],
        file: name,
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      }
    })
}

async function ensureTable(db) {
  await db.exec(`
    create table if not exists public.schema_migrations (
      version text primary key,
      name text not null,
      checksum text not null,
      applied_at timestamptz not null default now()
    );
    alter table public.schema_migrations enable row level security;
  `)
}

/* Every migration with whether it was applied, and whether the applied copy still matches the file. */
export async function migrationStatus(db, dir = MIGRATIONS_DIR) {
  await ensureTable(db)
  const applied = new Map(
    (await db.query('select version, checksum from public.schema_migrations')).map((row) => [
      row.version,
      row.checksum,
    ]),
  )
  return readMigrations(dir).map((migration) => ({
    version: migration.version,
    name: migration.name,
    applied: applied.has(migration.version),
    changed: applied.has(migration.version) && applied.get(migration.version) !== migration.checksum,
  }))
}

/* Returns the names of the migrations it applied. */
export async function migrate(db, { dir = MIGRATIONS_DIR, log = () => {} } = {}) {
  await ensureTable(db)
  const applied = new Map(
    (await db.query('select version, checksum from public.schema_migrations')).map((row) => [
      row.version,
      row.checksum,
    ]),
  )
  const done = []

  for (const migration of readMigrations(dir)) {
    if (applied.has(migration.version)) {
      if (applied.get(migration.version) !== migration.checksum) {
        throw new MigrationError(
          `${migration.file} was already applied and has changed since. Add a new migration instead.`,
        )
      }
      continue
    }
    log(`applying ${migration.file}`)
    await db.tx(async (t) => {
      await t.exec(migration.sql)
      await t.query('insert into public.schema_migrations (version, name, checksum) values ($1, $2, $3)', [
        migration.version,
        migration.name,
        migration.checksum,
      ])
    })
    done.push(migration.file)
  }
  return done
}
