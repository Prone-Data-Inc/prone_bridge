/* Turns the script into the voice over, one clip per scene, with the exact time of every word.
   One clip per scene means each scene of the video lasts exactly as long as its sentence: picture and voice cannot drift.
   Usage: ELEVEN_KEY_FILE=path-to-a-file-holding-the-key node tts.mjs [scene-id ...]
   The key is read from that file or from ELEVEN_API_KEY. It is never written anywhere. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const here = import.meta.dirname
const work = join(here, '..', 'work')
const audioDir = join(work, 'audio')
mkdirSync(audioDir, { recursive: true })

const key = process.env.ELEVEN_API_KEY ?? readFileSync(process.env.ELEVEN_KEY_FILE, 'utf8').trim()
const script = JSON.parse(readFileSync(join(here, 'script.json'), 'utf8'))
const only = new Set(process.argv.slice(2))
const scenes = script.scenes.filter((scene) => only.size === 0 || only.has(scene.id))

async function speak(scene, index) {
  const previous = script.scenes[index - 1]?.tts
  const next = script.scenes[index + 1]?.tts
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${script.voice.id}/with-timestamps?output_format=mp3_44100_128`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: scene.tts,
      model_id: script.voice.model,
      voice_settings: script.voice.settings,
      /* the neighbours give the voice the same tone across scenes */
      ...(previous ? { previous_text: previous } : {}),
      ...(next ? { next_text: next } : {}),
    }),
  })
  if (!response.ok) throw new Error(`${scene.id}: ${response.status} ${(await response.text()).slice(0, 300)}`)
  const body = await response.json()
  writeFileSync(join(audioDir, `${scene.id}.mp3`), Buffer.from(body.audio_base64, 'base64'))
  writeFileSync(join(audioDir, `${scene.id}.alignment.json`), JSON.stringify(body.alignment))
  return body.alignment
}

for (const scene of scenes) {
  const index = script.scenes.findIndex((entry) => entry.id === scene.id)
  const alignment = await speak(scene, index)
  const ends = alignment.character_end_times_seconds
  console.log(`${scene.id}: ${scene.tts.length} characters, speech ends at ${ends.at(-1).toFixed(2)} s`)
}
