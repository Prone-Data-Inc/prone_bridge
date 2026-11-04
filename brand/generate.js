/* Generates the ProneBridge brand files: the name as path data for the app, then logos, icons and the social card.
   Run with `npm run brand`. Vector masters go to brand/output; what the web app serves is copied to client/public. */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { PALETTE } from '../shared/src/brand/palette.js'
import { writeWordmark } from './src/wordmark.js'

const root = join(import.meta.dirname, '..')
const out = join(root, 'brand', 'output')
const pub = join(root, 'client', 'public')

for (const dir of ['logo', 'icons', 'social']) mkdirSync(join(out, dir), { recursive: true })
mkdirSync(join(pub, 'brand'), { recursive: true })

/* The name must exist before the logo module (which imports it) is loaded. */
writeWordmark(join(root, 'shared', 'src', 'brand', 'wordmark.js'))
const { markSvg, horizontalSvg, iconSvg, socialSvg } = await import('./src/art.js')

const png = (svg, file, { width, height, background } = {}) => {
  let image = sharp(Buffer.from(svg), { density: 300 })
  if (width || height)
    image = image.resize({ width, height, fit: 'contain', background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } })
  return image.png().toFile(file)
}

const files = []
const write = (relative, content) => {
  writeFileSync(join(out, relative), content)
  files.push(relative)
}

/* Logos */
const light = horizontalSvg()
const dark = horizontalSvg({ mark: PALETTE.blueOnDark, name: PALETTE.white })
write('logo/pronebridge-mark.svg', markSvg())
write('logo/pronebridge-horizontal.svg', light.svg)
write('logo/pronebridge-horizontal-dark.svg', dark.svg)
await png(light.svg, join(out, 'logo/pronebridge-horizontal-2400.png'), { width: 2400 })
await png(dark.svg, join(out, 'logo/pronebridge-horizontal-dark-2400.png'), { width: 2400 })
await png(markSvg(), join(out, 'logo/pronebridge-mark-1024.png'), { width: 1024 })

/* Icons */
write('icons/favicon.svg', iconSvg({ size: 64, radius: 0.22, inset: 0.6 }))
await png(iconSvg({ size: 512, radius: 0.22, inset: 0.6 }), join(out, 'icons/favicon-32.png'), {
  width: 32,
  height: 32,
})
await png(iconSvg({ size: 512, radius: 0.22, inset: 0.6 }), join(out, 'icons/favicon-48.png'), {
  width: 48,
  height: 48,
})
/* iOS and Android round the tile themselves, so these are full bleed with the mark well inside the safe area. */
await png(iconSvg({ size: 512, radius: 0, inset: 0.5 }), join(out, 'icons/apple-touch-icon.png'), {
  width: 180,
  height: 180,
})
await png(iconSvg({ size: 512, radius: 0, inset: 0.5 }), join(out, 'icons/icon-192.png'), { width: 192, height: 192 })
await png(iconSvg({ size: 512, radius: 0, inset: 0.5 }), join(out, 'icons/icon-512.png'), { width: 512, height: 512 })

/* Social card */
await png(socialSvg(), join(out, 'social/og-image-1200x630.png'), {
  width: 1200,
  height: 630,
  background: PALETTE.white,
})

/* What the web app serves */
const serve = [
  ['icons/favicon.svg', 'favicon.svg'],
  ['icons/favicon-32.png', 'favicon-32.png'],
  ['icons/apple-touch-icon.png', 'apple-touch-icon.png'],
  ['icons/icon-192.png', 'icon-192.png'],
  ['icons/icon-512.png', 'icon-512.png'],
  ['social/og-image-1200x630.png', 'og-image.png'],
  ['logo/pronebridge-horizontal.svg', 'brand/pronebridge-horizontal.svg'],
  ['logo/pronebridge-horizontal-dark.svg', 'brand/pronebridge-horizontal-dark.svg'],
  ['logo/pronebridge-mark.svg', 'brand/pronebridge-mark.svg'],
]
for (const [from, to] of serve) copyFileSync(join(out, from), join(pub, to))

console.log(
  `[brand] wrote ${files.length} vector files and the PNG set to brand/output, ${serve.length} files to client/public`,
)
