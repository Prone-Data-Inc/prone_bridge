/* The picture of a course: a gradient from the course's color, the Prone Data mark as a large faint shape, and an icon for
   its subject. Drawn, not photographed, so it always loads and always matches. */
import { Brain, ChartBar, Lightning, Stack } from '@phosphor-icons/react'
import { MARK, MARK_PATH } from '#shared/brand/logo.js'
import { cx } from '@/lib/cx.js'
import s from './CourseCover.module.css'

const ICONS = { data: ChartBar, ai: Brain, automation: Lightning }

export default function CourseCover({ product, size = 'card', className }) {
  const Icon = ICONS[product.category] ?? Stack
  return (
    <div className={cx(s.cover, s[product.cover], s[size], className)} aria-hidden>
      <svg className={s.mark} viewBox={`0 0 ${MARK.width} ${MARK.height}`}>
        <path d={MARK_PATH} fill="currentColor" />
      </svg>
      <span className={s.icon}>
        <Icon size={size === 'hero' ? 44 : 28} weight="bold" />
      </span>
    </div>
  )
}
