import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MigrationError, migrate, migrationStatus, readMigrations } from './migrate.js'
import { createTestDb } from './testing.js'

describe('migrations', () => {
  let db

  beforeAll(async () => {
    db = await createTestDb()
  })
  afterAll(() => db.close())

  it('has numbered files in order', () => {
    const files = readMigrations()
    expect(files.length).toBeGreaterThanOrEqual(2)
    expect(files.map((file) => file.version)).toEqual(files.map((_, index) => String(index + 1).padStart(4, '0')))
  })

  it('applies from nothing, once', async () => {
    const first = await migrate(db)
    expect(first).toEqual(readMigrations().map((file) => file.file))
    expect(await migrate(db)).toEqual([])
  })

  it('reports status', async () => {
    const status = await migrationStatus(db)
    expect(status.every((item) => item.applied && !item.changed)).toBe(true)
  })

  it('creates the expected tables', async () => {
    const rows = await db.query("select tablename from pg_tables where schemaname = 'public' order by 1")
    expect(rows.map((row) => row.tablename)).toEqual([
      'audit_log',
      'buyers',
      'checkout_sessions',
      'countries',
      'country_methods',
      'enrollments',
      'merchant_methods',
      'merchants',
      'notifications',
      'payment_events',
      'payment_methods',
      'payments',
      'payouts',
      'products',
      'schema_migrations',
    ])
  })

  it('turns row level security on for every table, so the public data API sees nothing', async () => {
    const open = await db.query(
      "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity",
    )
    expect(open).toEqual([])
  })

  it('gives the anon and authenticated roles no access to any table', async () => {
    const grants = await db.query(
      "select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')",
    )
    expect(grants).toEqual([])
  })

  it('refuses a migration that changed after it was applied', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pb-migrations-'))
    try {
      writeFileSync(join(dir, '0001_one.sql'), 'create table public.scratch (id int);')
      const scratch = await createTestDb()
      await migrate(scratch, { dir })
      writeFileSync(join(dir, '0001_one.sql'), 'create table public.scratch (id int, extra int);')
      await expect(migrate(scratch, { dir })).rejects.toThrow(MigrationError)
      await scratch.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('rolls a failing migration back completely', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pb-migrations-'))
    try {
      writeFileSync(join(dir, '0001_bad.sql'), 'create table public.half (id int); select 1 / 0;')
      const scratch = await createTestDb()
      await expect(migrate(scratch, { dir })).rejects.toThrow()
      expect(await scratch.query("select 1 from pg_tables where tablename = 'half'")).toEqual([])
      expect(await scratch.query('select 1 from public.schema_migrations')).toEqual([])
      await scratch.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
