/* Small status pill. tone: neutral, accent, success, warning, danger. */
import { cx } from '@/lib/cx.js'
import s from './Badge.module.css'

export default function Badge({ tone = 'neutral', dot = false, className, children }) {
  return (
    <span className={cx(s.badge, s[tone], className)}>
      {dot && <span className={s.dot} aria-hidden />}
      {children}
    </span>
  )
}
