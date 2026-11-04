/* Loading and empty states: Skeleton (a shimmering block), Spinner, EmptyState (icon, title, short text, action). */
import { CircleNotch } from '@phosphor-icons/react'
import { cx } from '@/lib/cx.js'
import s from './States.module.css'

export function Skeleton({ width = '100%', height = 16, radius = 6, className }) {
  return <span className={cx(s.skeleton, className)} style={{ width, height, borderRadius: radius }} aria-hidden />
}

export function Spinner({ size = 20, label = 'Loading' }) {
  return <CircleNotch size={size} weight="bold" className={s.spinner} role="status" aria-label={label} />
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className={s.empty}>
      {Icon && (
        <span className={s.badge}>
          <Icon size={24} aria-hidden />
        </span>
      )}
      <h3 className={s.title}>{title}</h3>
      {children && <p className={s.text}>{children}</p>}
      {action}
    </div>
  )
}
