/* Renders stills of the film at given seconds and puts them on one contact sheet. Usage: node look.mjs name t1 t2 ... */
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import ffmpeg from 'ffmpeg-static'
const work = join(import.meta.dirname, '..', 'work')
const [name, ...times] = process.argv.slice(2)
execFileSync('node', ['render.mjs', 'preview', ...times], {
  cwd: import.meta.dirname,
  stdio: ['ignore', 'ignore', 'inherit'],
})
const input = times.map((t) => ['-i', join(work, 'preview', `t${String(t).replace('.', '_')}.png`)]).flat()
const columns = Math.min(3, times.length)
const rows = Math.ceil(times.length / columns)
const filter =
  times.map((_, i) => `[${i}:v]scale=800:-1[v${i}]`).join(';') +
  ';' +
  times.map((_, i) => `[v${i}]`).join('') +
  `xstack=inputs=${times.length}:layout=${times.map((_, i) => `${(i % columns) * 800}_${Math.floor(i / columns) * 450}`).join('|')}[out]`
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
  join(work, 'preview', `look-${name}.jpg`),
])
console.log('wrote', join(work, 'preview', `look-${name}.jpg`), times.map((t, i) => `${i}=${t}`).join(' '))
