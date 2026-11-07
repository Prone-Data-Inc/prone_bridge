/* Builds the timeline of the film from the voice over: when each scene starts, how long it lasts, when every word is said,
   and the caption chunks. Picture and voice share this one clock, so they cannot drift apart.
   Usage: node plan.mjs   (needs the clips made by tts.mjs) */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ffprobe from 'ffprobe-static'

const here = import.meta.dirname
const work = join(here, '..', 'work')
const script = JSON.parse(readFileSync(join(here, 'script.json'), 'utf8'))

/* The voice is sped up by this much, in the audio mix. Every time below already counts it. */
export const TEMPO = 1.05
export const FPS = 30
const LEAD = 0.45 /* picture before the voice of a scene */
const TAIL = 0.55 /* picture after it */
const OVERLAP = 0.35 /* scenes cross-fade over this long */
const HOLD_END = 3.0 /* the last card stays after the voice ends */

const durationOf = (file) =>
  Number(
    execFileSync(ffprobe.path, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {
      encoding: 'utf8',
    }),
  )

/* Words with their start and end, from the character times of the voice. Single capital letters in a row ("A I", "U S S D")
   are one word, so a caption never splits an acronym. */
function wordsOf(alignment) {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment
  const words = []
  let current = null
  characters.forEach((character, index) => {
    if (/\s/.test(character)) {
      current = null
      return
    }
    if (!current) {
      current = { text: '', start: starts[index], end: ends[index] }
      words.push(current)
    }
    current.text += character
    current.end = ends[index]
  })
  /* a spelled out letter, with the punctuation that may follow it: "A", "I,", "D." */
  const letter = (text) => /^[A-Z][.,;:!?]*$/.test(text)
  const merged = []
  for (const word of words) {
    const previous = merged.at(-1)
    if (previous?.spelled && letter(word.text)) {
      previous.text += word.text
      previous.end = word.end
    } else {
      merged.push({ ...word, spelled: letter(word.text) })
    }
  }
  return merged.map(({ spelled, ...word }) => word)
}

/* Short caption chunks: end at a full stop, or at a comma once there are enough words, and never run long. */
function chunksOf(words) {
  const chunks = []
  let current = []
  const flush = () => {
    if (current.length) chunks.push(current)
    current = []
  }
  /* how many words are left before the sentence ends, from this one on */
  const leftInSentence = (from) => {
    let count = 0
    for (let at = from; at < words.length; at += 1) {
      count += 1
      if (/[.?!]$/.test(words[at].text)) break
    }
    return count
  }
  words.forEach((word, index) => {
    current.push(word)
    const endsSentence = /[.?!]$/.test(word.text)
    const endsClause = /[,;:]$/.test(word.text)
    /* a long chunk breaks, unless only a word or two of the sentence is left (no orphan lines) */
    const tooLong = current.length >= 10 && leftInSentence(index + 1) > 2
    if (endsSentence || (endsClause && current.length >= 4 && leftInSentence(index + 1) > 1) || tooLong) flush()
  })
  flush()
  return chunks
}

const brand = (text) => text.replaceAll('Prone Bridge', 'ProneBridge')

let cursor = 0
const scenes = script.scenes.map((scene, index) => {
  const audioFile = join(work, 'audio', `${scene.id}.mp3`)
  const alignment = JSON.parse(readFileSync(join(work, 'audio', `${scene.id}.alignment.json`), 'utf8'))
  const audioDuration = durationOf(audioFile) / TEMPO
  const last = index === script.scenes.length - 1
  const duration = LEAD + audioDuration + TAIL + (last ? HOLD_END : 0)
  const start = cursor
  cursor += duration - (last ? 0 : OVERLAP)

  /* word times are local to the scene: they start after the lead, and are sped up like the voice */
  const words = wordsOf(alignment).map((word) => ({
    text: word.text,
    start: LEAD + word.start / TEMPO,
    end: LEAD + word.end / TEMPO,
  }))
  const chunks = chunksOf(words).map((chunk, at, all) => {
    const next = all[at + 1]
    return {
      text: brand(chunk.map((word) => word.text).join(' ')),
      start: Math.max(0, chunk[0].start - 0.08),
      end: next ? Math.max(chunk.at(-1).end + 0.15, next[0].start - 0.08) : chunk.at(-1).end + 0.45,
    }
  })
  return {
    id: scene.id,
    start,
    duration,
    audioStart: start + LEAD,
    audioFile: `${scene.id}.mp3`,
    words,
    chunks,
  }
})

const total = scenes.at(-1).start + scenes.at(-1).duration
const timeline = { fps: FPS, tempo: TEMPO, overlap: OVERLAP, total, scenes }
writeFileSync(join(work, 'timeline.json'), JSON.stringify(timeline, null, 1))

console.log(`total ${total.toFixed(2)} s, ${Math.ceil(total * FPS)} frames`)
for (const scene of scenes) {
  console.log(
    `${scene.id.padEnd(12)} start ${scene.start.toFixed(2).padStart(6)}  duration ${scene.duration.toFixed(2).padStart(6)}  words ${scene.words.length}  captions ${scene.chunks.length}`,
  )
}
