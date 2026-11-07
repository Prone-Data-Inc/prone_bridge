/* Makes a contact sheet of recorded frames at given source times (seconds), 3 columns, to see where things are on screen.
   Usage: node sheet.mjs name t1 t2 t3 ... */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ffmpeg from 'ffmpeg-static'
const work = join(import.meta.dirname, '..', 'work')
const meta = JSON.parse(readFileSync(join(work, 'footage', 'meta.json'), 'utf8'))
const [name, ...times] = process.argv.slice(2)
const dir = join(work, 'preview', `sheet-${name}`)
mkdirSync(dir, { recursive: true })
times.forEach((value, index) => {
  const t = Number(value)
  let pick = meta.frames[0]
  for (const frame of meta.frames) if (frame[0] <= t) pick = frame
  copyFileSync(join(work, 'footage', pick[1]), join(dir, `${String(index).padStart(2, '0')}.jpg`))
})
const columns = 3
const rows = Math.ceil(times.length / columns)
execFileSync(ffmpeg, [
  '-y',
  '-loglevel',
  'error',
  '-framerate',
  '1',
  '-i',
  join(dir, '%02d.jpg'),
  '-vf',
  `scale=640:-1,tile=${columns}x${rows}:padding=6:color=white`,
  '-frames:v',
  '1',
  join(work, 'preview', `sheet-${name}.jpg`),
])
console.log('wrote', join(work, 'preview', `sheet-${name}.jpg`), times.map((t, i) => `${i}=${t}s`).join(' '))
