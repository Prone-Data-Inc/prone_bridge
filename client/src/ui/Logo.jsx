/* The ProneBridge logo as inline SVG, so it follows the theme: the mark takes the accent blue, the name takes the text
   color. Geometry comes from shared/src/brand/logo.js, the same source the brand files are generated from. */
import { BRAND } from '#shared/brand/palette.js'
import { MARK_PATH, WORDMARK, horizontalLockup, wordmarkAttributes } from '#shared/brand/logo.js'
import s from './Logo.module.css'

const lockup = horizontalLockup()

export default function Logo({ height = 32 }) {
  const width = (height * lockup.width) / lockup.height
  return (
    <svg
      className={s.logo}
      role="img"
      aria-label={BRAND.spaced}
      width={width}
      height={height}
      viewBox={`0 0 ${lockup.width} ${lockup.height}`}
    >
      <path className={s.mark} d={MARK_PATH} />
      <path
        className={s.name}
        transform={`translate(${lockup.name.x} ${lockup.name.y})`}
        d={WORDMARK.d}
        {...wordmarkAttributes}
      />
    </svg>
  )
}
