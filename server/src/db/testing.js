/* A real Postgres in memory (PGlite) for tests and for trying the schema without any account. It is shaped like a
   Supabase project: the anon, authenticated and service_role roles exist, and realtime.send records what it was
   asked to broadcast in realtime.sent so tests can look at it. */
import { PGlite } from '@electric-sql/pglite'

const SUPABASE_SHAPE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema realtime;
  create table realtime.sent (id bigserial primary key, payload jsonb, event text, topic text, private boolean);
  create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
    returns void language plpgsql as $$
    begin
      insert into realtime.sent (payload, event, topic, private) values (payload, event, topic, private);
    end $$;
`

const handle = (runner) => ({
  query: async (text, params) => (await runner.query(text, params)).rows,
  exec: async (sql) => {
    await runner.exec(sql)
  },
})

export async function createTestDb({ supabaseShape = true } = {}) {
  const pglite = new PGlite()
  await pglite.waitReady
  if (supabaseShape) await pglite.exec(SUPABASE_SHAPE)
  return {
    ...handle(pglite),
    tx: (work) => pglite.transaction((transaction) => work(handle(transaction))),
    close: () => pglite.close(),
  }
}
