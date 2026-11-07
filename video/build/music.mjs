/* Asks ElevenLabs for an instrumental bed for the film (no voice), as long as the film.
   Usage: ELEVEN_KEY_FILE=path node music.mjs   The key is read from that file, and never written anywhere. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const work = join(import.meta.dirname, '..', 'work')
mkdirSync(join(work, 'audio'), { recursive: true })
const key = process.env.ELEVEN_API_KEY ?? readFileSync(process.env.ELEVEN_KEY_FILE, 'utf8').trim()
const timeline = JSON.parse(readFileSync(join(work, 'timeline.json'), 'utf8'))
const length = Math.ceil((timeline.total + 3) * 1000)

const prompt = [
  'Calm, modern and confident instrumental for a fintech product film.',
  'Warm soft piano and airy synth pads, a gentle pulsing bass, very light percussion that builds slowly.',
  'Optimistic and premium, around 92 BPM, steady energy with no drops and no vocals.',
  'Resolves warmly at the very end.',
].join(' ')

const response = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
  method: 'POST',
  headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt, music_length_ms: length, force_instrumental: true }),
})
if (!response.ok) {
  console.log(`music failed: ${response.status} ${(await response.text()).slice(0, 400)}`)
  process.exit(1)
}
writeFileSync(join(work, 'audio', 'music.mp3'), Buffer.from(await response.arrayBuffer()))
console.log(`music made, ${(length / 1000).toFixed(0)} s asked for`)
