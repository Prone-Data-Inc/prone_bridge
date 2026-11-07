/* Builds the sound of the film: each scene's voice placed at the exact second its scene starts, the music under it (it
   lowers itself while the voice speaks), then the loudness set for YouTube. Also writes the captions as an .srt file.
   Usage: node mix.mjs */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ffmpeg from 'ffmpeg-static'

const work = join(import.meta.dirname, '..', 'work')
const audio = join(work, 'audio')
const timeline = JSON.parse(readFileSync(join(work, 'timeline.json'), 'utf8'))
const TOTAL = timeline.total
const hasMusic = existsSync(join(audio, 'music.mp3'))

const run = (args) => {
  const result = spawnSync(ffmpeg, ['-y', '-hide_banner', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  if (result.status !== 0) throw new Error(result.stderr.split('\n').slice(-12).join('\n'))
  return result.stderr
}
/* the integrated loudness of a file, in LUFS */
const loudness = (file) => {
  const out = run(['-i', file, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'])
  const found = [...out.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)
  return found ? Number(found[1]) : NaN
}

/* 1. the voice: every scene sped up by the film's tempo and delayed to its start */
const inputs = timeline.scenes.flatMap((scene) => ['-i', join(audio, scene.audioFile)])
const chains = timeline.scenes
  .map((scene, index) => {
    const delay = Math.round(scene.audioStart * 1000)
    return `[${index}:a]rubberband=tempo=${timeline.tempo},aresample=48000,aformat=channel_layouts=stereo,adelay=${delay}|${delay}[v${index}]`
  })
  .join(';')
const mixed = timeline.scenes.map((_, index) => `[v${index}]`).join('')
const voiceGraph = `${chains};${mixed}amix=inputs=${timeline.scenes.length}:normalize=0:dropout_transition=0,highpass=f=70,acompressor=threshold=-21dB:ratio=3:attack=8:release=160:makeup=3,apad=whole_dur=${TOTAL.toFixed(3)},atrim=0:${TOTAL.toFixed(3)}[voice]`
run([...inputs, '-filter_complex', voiceGraph, '-map', '[voice]', '-c:a', 'pcm_s16le', join(work, 'voice.wav')])
const voiceLufs = loudness(join(work, 'voice.wav'))
console.log(`voice: ${voiceLufs} LUFS`)

/* 2. the music, set 15 LU under the voice before it ducks, then both together */
let finalGraph
let finalInputs
if (hasMusic) {
  run(['-i', join(audio, 'music.mp3'), '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', join(work, 'music.wav')])
  const musicLufs = loudness(join(work, 'music.wav'))
  const gain = 10 ** ((voiceLufs - 15 - musicLufs) / 20)
  console.log(`music: ${musicLufs} LUFS, gain ${gain.toFixed(3)}`)
  finalInputs = ['-i', join(work, 'voice.wav'), '-i', join(work, 'music.wav')]
  finalGraph =
    `[1:a]atrim=0:${TOTAL.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=2.5,afade=t=out:st=${(TOTAL - 4.5).toFixed(3)}:d=4.5,volume=${gain.toFixed(4)}[music];` +
    `[0:a]asplit=2[vkey][vmix];` +
    `[music][vkey]sidechaincompress=threshold=0.02:ratio=9:attack=25:release=500:makeup=1[ducked];` +
    `[vmix][ducked]amix=inputs=2:normalize=0,alimiter=limit=0.93,loudnorm=I=-16:TP=-1.5:LRA=9[mix]`
} else {
  finalInputs = ['-i', join(work, 'voice.wav')]
  finalGraph = `[0:a]alimiter=limit=0.93,loudnorm=I=-16:TP=-1.5:LRA=9[mix]`
}
run([
  ...finalInputs,
  '-filter_complex',
  finalGraph,
  '-map',
  '[mix]',
  '-ar',
  '48000',
  '-t',
  TOTAL.toFixed(3),
  '-c:a',
  'pcm_s16le',
  join(work, 'mix.wav'),
])
console.log(`mix: ${loudness(join(work, 'mix.wav'))} LUFS, ${TOTAL.toFixed(2)} s`)

/* 3. the captions as a file, for YouTube */
const stamp = (seconds) => {
  const ms = Math.round(seconds * 1000)
  const pad = (value, size = 2) => String(value).padStart(size, '0')
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor((ms % 3600000) / 60000))}:${pad(Math.floor((ms % 60000) / 1000))},${pad(ms % 1000, 3)}`
}
let counter = 0
const srt = timeline.scenes
  .flatMap((scene) =>
    scene.chunks.map((chunk) => ({ from: scene.start + chunk.start, to: scene.start + chunk.end, text: chunk.text })),
  )
  .map((cue) => `${++counter}\n${stamp(cue.from)} --> ${stamp(cue.to)}\n${cue.text}\n`)
  .join('\n')
writeFileSync(join(work, 'captions.srt'), srt)
console.log(`captions: ${counter} cues`)
void execFileSync
