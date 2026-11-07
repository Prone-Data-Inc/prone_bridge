/* Gets the demo ready to be filmed. It only adds to the demo, it never deletes: it runs the card testing attack, so the
   admin has blocked payments to show.
   For history dated up to today, press "Reset the demo" in the app yourself first (that erases the earlier demo rows,
   so it is your call), then run this and record.mjs again. Talks to the running app on port 8100.
   Usage: node prepare.mjs */
const base = process.env.APP ?? 'http://127.0.0.1:8100'

async function call(path, method = 'GET') {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
    body: method === 'POST' ? '{}' : undefined,
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${body?.error?.message ?? ''}`)
  return body.data
}

const before = await call('/demo/state')
console.log(`before: ${before.made} payments made, ${before.waiting} waiting for review`)
const attack = before.scenarios.find((scenario) => scenario.id === 'attack')
if (!attack?.available) {
  console.log(`attack not run: ${attack?.reason ?? 'not available'}`)
} else {
  const result = await call('/demo/scenarios/attack/run', 'POST')
  console.log(`attack: ${result.headline} (${result.seconds} s)`)
}
const after = await call('/demo/state')
console.log(`after: ${after.made} payments made, ${after.waiting} waiting for review`)
