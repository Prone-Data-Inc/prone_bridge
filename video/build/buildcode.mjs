/* Prepares the code shots: real excerpts of the repository, line ranges taken as they are, colored with highlight.js, one
   html string per line. Nothing is retyped, so what the film shows is what the repository holds.
   Usage: node buildcode.mjs */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import hljs from 'highlight.js'

const here = import.meta.dirname
const repo = join(here, '..', '..')
const work = join(here, '..', 'work')

/* [file, [from, to]] pairs, 1-based and inclusive. Several ranges in one excerpt are separated by a gap marker. */
const EXCERPTS = {
  orders: ['server/src/integrations/paypal/client.js', [[122, 142]]],
  payouts: ['server/src/integrations/paypal/client.js', [[177, 198]]],
  webhook: ['server/src/integrations/paypal/client.js', [[158, 175]]],
  tools: [
    'server/src/lib/copilot.js',
    [
      [19, 26],
      [66, 71],
    ],
  ],
  explain: [
    'server/src/services/risk.service.js',
    [
      [159, 169],
      [173, 178],
    ],
  ],
  rules: ['server/src/lib/risk.js', [[174, 194]]],
  prompt: ['server/src/services/risk.service.js', [[27, 34]]],
}

/* Splits highlighted html into lines, closing and reopening spans that run across a line break. */
function splitLines(html) {
  const lines = []
  let current = ''
  const open = []
  const tokens = html.split(/(<[^>]+>|\n)/).filter((piece) => piece !== '')
  for (const token of tokens) {
    if (token === '\n') {
      lines.push(current + '</span>'.repeat(open.length))
      current = open.join('')
    } else if (token.startsWith('</')) {
      open.pop()
      current += token
    } else if (token.startsWith('<')) {
      open.push(token)
      current += token
    } else {
      current += token
    }
  }
  lines.push(current + '</span>'.repeat(open.length))
  return lines
}

const out = {}
for (const [key, [file, ranges]] of Object.entries(EXCERPTS)) {
  const source = readFileSync(join(repo, file), 'utf8').split(/\r?\n/)
  const pieces = ranges.map(([from, to]) => {
    const text = source.slice(from - 1, to)
    /* the text is shown exactly: only the indentation shared by every line is taken off */
    const indent = Math.min(...text.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length))
    const trimmed = text.map((line) => line.slice(indent))
    return {
      from,
      to,
      lines: splitLines(hljs.highlight(trimmed.join('\n'), { language: 'javascript' }).value),
      plain: trimmed,
    }
  })
  const lines = []
  pieces.forEach((piece, index) => {
    if (index > 0) lines.push({ gap: true })
    piece.lines.forEach((html, offset) => lines.push({ number: piece.from + offset, html, plain: piece.plain[offset] }))
  })
  out[key] = { file, lines }
  console.log(`${key}: ${file} ${ranges.map(([a, b]) => `${a}-${b}`).join(', ')} (${lines.length} lines)`)
}
writeFileSync(join(work, 'code.json'), JSON.stringify(out))
