/* Text as SVG paths (Inter, laid out by fontkit), so brand files render the same on any machine without installed fonts. */
import { createRequire } from 'node:module'
import * as fontkit from 'fontkit'

const require = createRequire(import.meta.url)
const SEMIBOLD = fontkit.openSync(require.resolve('@fontsource/inter/files/inter-latin-600-normal.woff'))

/* Width of `text` at `size` px. */
export function textWidth(text, size) {
  const run = SEMIBOLD.layout(text)
  return run.positions.reduce((sum, p) => sum + p.xAdvance, 0) * (size / SEMIBOLD.unitsPerEm)
}

/* SVG path data of `text` with its baseline starting at (x, y). */
export function textPath(text, { size, x = 0, y = 0 }) {
  const run = SEMIBOLD.layout(text)
  const scale = size / SEMIBOLD.unitsPerEm
  let pen = x
  return run.glyphs
    .map((glyph, i) => {
      const d = glyph.path
        .scale(scale, -scale)
        .translate(pen + run.positions[i].xOffset * scale, y - run.positions[i].yOffset * scale)
        .toSVG()
      pen += run.positions[i].xAdvance * scale
      return d
    })
    .join('')
}
