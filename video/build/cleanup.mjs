/* Dismisses the copilot proposals still pending from earlier takes of the recording, so the next take starts clean.
   A dismissed proposal changes nothing; it only closes it. Usage: node cleanup.mjs */
const base = process.env.APP ?? 'http://127.0.0.1:8100'
const status = await (await fetch(`${base}/api/copilot/status?merchant=pdl`)).json()
for (const action of status.data.pending) {
  const response = await fetch(`${base}/api/copilot/actions/${action.id}/dismiss`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant: 'pdl' }),
  })
  console.log(`dismissed ${action.summary}: ${response.status}`)
}
console.log(`${status.data.pending.length} pending proposal(s) closed`)
