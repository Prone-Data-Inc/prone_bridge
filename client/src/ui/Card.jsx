/* Card (title, optional action, body) and StatCard (a KPI tile: label, value, change, optional footer). */
import { TrendDown, TrendUp } from '@phosphor-icons/react'
import { cx } from '@/lib/cx.js'
import { percent } from '@/lib/format.js'
import s from './Card.module.css'

export function Card({ title, action, flush = false, className, children }) {
  return (
    <section className={cx(s.card, flush && s.flush, className)}>
      {(title || action) && (
        <header className={s.header}>
          {title && <h3 className={s.title}>{title}</h3>}
          {action && <div className={s.action}>{action}</div>}
        </header>
      )}
      <div className={s.body}>{children}</div>
    </section>
  )
}

/* delta is a fraction (0.042 is +4.2%). goodWhen says which direction is good news: 'up' (revenue) or 'down' (fraud). */
export function StatCard({ label, value, delta, goodWhen = 'up', tone = 1, children }) {
  const rising = delta > 0
  const good = delta === 0 ? null : rising === (goodWhen === 'up')
  const Trend = delta < 0 ? TrendDown : TrendUp

  return (
    <article className={cx(s.stat, s[`tone${tone}`])}>
      <h3 className={s.statLabel}>{label}</h3>
      <div className={s.statRow}>
        <strong className={s.statValue}>{value}</strong>
        {delta !== undefined && (
          <span className={cx(s.delta, good === true && s.good, good === false && s.bad)}>
            {percent(delta, { signed: true })}
            <Trend size={16} aria-hidden />
          </span>
        )}
      </div>
      {children}
    </article>
  )
}
