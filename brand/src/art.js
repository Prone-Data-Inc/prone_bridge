/* SVG compositions of the ProneBridge brand: the mark, the horizontal lockup (light and dark surfaces), the app icon
   and the social card. Pure functions that return SVG text. */
import { BRAND, PALETTE } from '../../shared/src/brand/palette.js'
import { MARK, MARK_PATH, WORDMARK, horizontalLockup } from '../../shared/src/brand/logo.js'
import { textPath, textWidth } from './type.js'

const svg = (width, height, body, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"${extra}>${body}</svg>`

const markPath = (fill, transform = '') =>
  `<path fill="${fill}"${transform ? ` transform="${transform}"` : ''} d="${MARK_PATH}"/>`

const namePath = (fill, transform) =>
  `<path fill="${fill}" fill-rule="evenodd" stroke="${fill}" stroke-width="${WORDMARK.stroke}" stroke-linejoin="round" transform="${transform}" d="${WORDMARK.d}"/>`

/* Just the mark, tightly cropped. */
export const markSvg = (fill = PALETTE.blue) => svg(MARK.width, MARK.height, markPath(fill))

/* Mark plus name, with a margin of a quarter of the capital height. Returns the svg and its size. */
export function horizontalSvg({ mark = PALETTE.blue, name = PALETTE.ink, margin } = {}) {
  const lockup = horizontalLockup()
  const pad = margin ?? Math.round(lockup.capHeight * 0.25)
  const body =
    markPath(mark, `translate(${pad} ${pad})`) +
    namePath(name, `translate(${pad + lockup.name.x} ${pad + lockup.name.y})`)
  return {
    svg: svg(lockup.width + pad * 2, lockup.height + pad * 2, body),
    width: lockup.width + pad * 2,
    height: lockup.height + pad * 2,
  }
}

/* The app icon: a blue tile with the white mark. `inset` is the share of the tile the mark may fill. */
export function iconSvg({ size = 512, radius = 0.22, inset = 0.56 } = {}) {
  const markWidth = size * inset
  const scale = markWidth / MARK.width
  const x = (size - MARK.width * scale) / 2
  const y = (size - MARK.height * scale) / 2
  return svg(
    size,
    size,
    `<rect width="${size}" height="${size}" rx="${size * radius}" fill="${PALETTE.blue}"/>${markPath(PALETTE.white, `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(5)})`)}`,
  )
}

/* The card shown when a link is shared: light surface, soft blue glow, centred logo and the tagline. */
export function socialSvg({ width = 1200, height = 630 } = {}) {
  const logo = horizontalLockup()
  const logoWidth = 640
  const scale = logoWidth / logo.width
  const logoX = (width - logoWidth) / 2
  const logoY = height * 0.36
  const tagSize = 34
  const tagX = (width - textWidth(BRAND.tagline, tagSize)) / 2
  const tagY = logoY + logo.height * scale + 88

  const body = `<defs>
<radialGradient id="glowA" cx="0.1" cy="0.05" r="0.75"><stop offset="0" stop-color="${PALETTE.blue}" stop-opacity="0.16"/><stop offset="1" stop-color="${PALETTE.blue}" stop-opacity="0"/></radialGradient>
<radialGradient id="glowB" cx="0.95" cy="1" r="0.7"><stop offset="0" stop-color="${PALETTE.sky}" stop-opacity="0.14"/><stop offset="1" stop-color="${PALETTE.sky}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${width}" height="${height}" fill="${PALETTE.white}"/><rect width="${width}" height="${height}" fill="url(#glowA)"/><rect width="${width}" height="${height}" fill="url(#glowB)"/>
<g transform="translate(${logoX} ${logoY}) scale(${scale.toFixed(5)})">${markPath(PALETTE.blue)}${namePath(PALETTE.ink, `translate(${logo.name.x} ${logo.name.y})`)}</g>
<path fill="${PALETTE.ink}" fill-opacity="0.72" d="${textPath(BRAND.tagline, { size: tagSize, x: tagX, y: tagY })}"/>`
  return svg(width, height, body)
}
