/* ProneBridge logo geometry. The mark is the Prone Data mark (a bar, a dot and two slanted bars) in pixels of the
   official file, drawn here as one path so it can take any color. The name "Prone Bridge" is path data generated from
   Outfit by `npm run brand` (see wordmark.js), so the logo looks the same on any machine without the font. */
import { WORDMARK } from './wordmark.js'

export const MARK = Object.freeze({
  width: 686,
  height: 625,
  bar: { x: 129, y: 0, width: 416, height: 143 },
  dot: { x: 337, y: 293, r: 73.5 },
  bars: {
    r: 71.5,
    left: [
      [71.5, 317.5],
      [208.5, 553.5],
    ],
    right: [
      [614.5, 317.5],
      [476.5, 553.5],
    ],
  },
})

const round = (n) => +n.toFixed(2)

/* A bar from a to b with round ends of radius r, as a closed path. */
function capsule([ax, ay], [bx, by], r) {
  const length = Math.hypot(bx - ax, by - ay)
  const [nx, ny] = [(-(by - ay) / length) * r, ((bx - ax) / length) * r]
  return `M${round(ax + nx)} ${round(ay + ny)}L${round(bx + nx)} ${round(by + ny)}A${r} ${r} 0 0 0 ${round(bx - nx)} ${round(by - ny)}L${round(ax - nx)} ${round(ay - ny)}A${r} ${r} 0 0 0 ${round(ax + nx)} ${round(ay + ny)}Z`
}

const { bar, dot, bars } = MARK
const half = bar.height / 2

export const MARK_PATH = [
  `M${bar.x + half} ${bar.y}H${bar.x + bar.width - half}A${half} ${half} 0 0 1 ${bar.x + bar.width - half} ${bar.y + bar.height}H${bar.x + half}A${half} ${half} 0 0 1 ${bar.x + half} ${bar.y}Z`,
  `M${dot.x - dot.r} ${dot.y}a${dot.r} ${dot.r} 0 1 0 ${dot.r * 2} 0a${dot.r} ${dot.r} 0 1 0 ${-dot.r * 2} 0Z`,
  capsule(bars.left[0], bars.left[1], bars.r),
  capsule(bars.right[0], bars.right[1], bars.r),
].join('')

export { WORDMARK }

/* Horizontal lockup at its natural size: the mark, then the name vertically centred on the mark by its capitals. */
export function horizontalLockup() {
  const capHeight = WORDMARK.baseline - WORDMARK.capTop
  const gap = 0.7 * capHeight
  const nameX = MARK.width + gap
  const nameTop = (MARK.height - capHeight) / 2
  return {
    width: round(nameX + WORDMARK.width),
    height: MARK.height,
    capHeight,
    name: { x: round(nameX), y: round(nameTop - WORDMARK.capTop) },
  }
}

/* The attributes of the name's <path>, in lockup units. */
export const wordmarkAttributes = {
  fillRule: 'evenodd',
  strokeWidth: WORDMARK.stroke,
  strokeLinejoin: 'round',
}
