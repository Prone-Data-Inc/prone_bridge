/* Hover and focus readout: the value leads, the series name follows, keyed with a short line in the series color.
   It flips to the left of the anchor near the right edge. */
import { cx } from '@/lib/cx.js'
import s from './Charts.module.css'

export default function ChartTooltip({ x, y = 0, width, title, rows }) {
  const flip = x > width - 160
  const style = { left: x, top: y, transform: flip ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }

  return (
    <div className={s.tooltip} style={style} role="status">
      {title && <p className={s.tipTitle}>{title}</p>}
      {rows.map((row) => (
        <div key={row.label} className={s.tipRow}>
          <span className={cx(s.keyLine, row.dashed && s.keyDashed)} style={{ '--key': row.color }} aria-hidden />
          <strong>{row.value}</strong>
          <span>{row.label}</span>
        </div>
      ))}
    </div>
  )
}
