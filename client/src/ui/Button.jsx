/* Text button (primary, secondary, ghost, danger) and a square icon button with an optional count badge. */
import { CircleNotch } from '@phosphor-icons/react'
import { cx } from '@/lib/cx.js'
import s from './Button.module.css'

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  className,
  children,
  disabled,
  ...rest
}) {
  return (
    <button
      type="button"
      className={cx(s.button, s[variant], s[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <CircleNotch size={16} weight="bold" className={s.spin} aria-hidden />
      ) : (
        Icon && <Icon size={16} weight="bold" aria-hidden />
      )}
      {children}
      {IconRight && <IconRight size={14} weight="bold" aria-hidden />}
    </button>
  )
}

/* badge: true shows a dot, a number shows a count (9+ above nine). */
export function IconButton({ icon: Icon, label, active, badge, weight, className, ...rest }) {
  const count = typeof badge === 'number' ? (badge > 9 ? '9+' : String(badge)) : null
  return (
    <button
      type="button"
      className={cx(s.icon, active && s.active, className)}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon size={20} weight={weight ?? (active ? 'fill' : 'regular')} aria-hidden />
      {badge === true && <span className={s.dot} />}
      {count && badge > 0 && <span className={s.count}>{count}</span>}
    </button>
  )
}
