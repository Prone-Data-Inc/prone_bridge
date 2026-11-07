/* Copies the recorded frame at a mark (plus an offset in seconds) into work/preview, to look at it. Usage: node peek.mjs mark[+offset] ... */
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
const work = join(import.meta.dirname, '..', 'work')
const meta = JSON.parse(readFileSync(join(work, 'footage', 'meta.json'), 'utf8'))
mkdirSync(join(work, 'preview'), { recursive: true })
if (process.argv.length < 3) console.log(JSON.stringify(meta.marks))
for (const arg of process.argv.slice(2)) {
  const [name, offset = '0'] = arg.split('+')
  const t = (name in meta.marks ? meta.marks[name] : Number(name)) + Number(offset)
  let pick = meta.frames[0]
  for (const frame of meta.frames) if (frame[0] <= t) pick = frame
  copyFileSync(join(work, 'footage', pick[1]), join(work, 'preview', `peek-${name}.jpg`))
  console.log(`${arg}: t=${t.toFixed(2)} -> ${pick[1]}`)
}
