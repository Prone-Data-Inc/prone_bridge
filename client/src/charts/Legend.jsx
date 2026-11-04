/* Chart legend. Keys mirror the mark: a short line (solid or dashed) for lines, a dot for fills. */
import { cx } from '@/lib/cx.js'
import s from './Charts.module.css'

export default function Legend({ items }) {
  return (
    <ul className={s.legend}>
      {items.map((item) => (
        <li key={item.label} className={s.legendItem}>
          <span
            className={cx(item.shape === 'dot' ? s.keyDot : s.keyLine, item.dashed && s.keyDashed)}
            style={{ '--key': item.color }}
            aria-hidden
          />
          {item.label}
        </li>
      ))}
    </ul>
  )
}
