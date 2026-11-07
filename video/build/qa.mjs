/* Pulls frames out of the FINAL video at given seconds and tiles them, to check the real output. Usage: node qa.mjs name t1 t2 ... */
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import ffmpeg from 'ffmpeg-static'
const root = join(import.meta.dirname, '..')
const [name, ...times] = process.argv.slice(2)
const dir = join(root, 'work', 'preview', `qa-${name}`)
mkdirSync(dir, { recursive: true })
times.forEach((t, i) =>
  execFileSync(ffmpeg, [
    '-y',
    '-loglevel',
    'error',
    '-ss',
    String(t),
    '-i',
    join(root, 'out', 'ProneBridge-demo.mp4'),
    '-frames:v',
    '1',
    join(dir, `${String(i).padStart(2, '0')}.png`),
  ]),
)
const columns = 3
const rows = Math.ceil(times.length / columns)
const input = times.map((_, i) => ['-i', join(dir, `${String(i).padStart(2, '0')}.png`)]).flat()
const filter =
  times.map((_, i) => `[${i}:v]scale=800:-1[v${i}]`).join(';') +
  ';' +
  times.map((_, i) => `[v${i}]`).join('') +
  `xstack=inputs=${times.length}:layout=${times.map((_, i) => `${(i % columns) * 800}_${Math.floor(i / columns) * 450}`).join('|')}:fill=white[out]`
execFileSync(ffmpeg, [
  '-y',
  '-loglevel',
  'error',
  ...input,
  '-filter_complex',
  filter,
  '-map',
  '[out]',
  '-frames:v',
  '1',
  join(root, 'work', 'preview', `qa-${name}.jpg`),
])
console.log('wrote', join(root, 'work', 'preview', `qa-${name}.jpg`), times.join(' '))
