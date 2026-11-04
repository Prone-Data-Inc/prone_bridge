/* Part-to-whole donut (up to four parts) with a small gap between segments and a legend with values. Hovering a
   segment or a legend row shows that part in the centre. data: [{ label, value, color }]. */
import { useState } from 'react'
import { cx } from '@/lib/cx.js'
import s from './Charts.module.css'
import d from './DonutChart.module.css'

const GAP = 2

export default function DonutChart({ data, format, center, caption, size = 148, thickness = 22 }) {
  const [active, setActive] = useState(null)
  const r = (size - thickness) / 2
  const circumference = 2 * Math.PI * r
  const total = data.reduce((sum, part) => sum + part.value, 0)

  const segments = data.reduce((list, part) => {
    const prev = list.at(-1)
    const length = total ? (part.value / total) * circumference : 0
    const offset = prev ? prev.offset + prev.length : 0
    return [...list, { ...part, length, offset, dash: Math.max(0, length - GAP) }]
  }, [])

  const focus = active === null ? null : data[active]
  const pct = (value) => `${(total ? (value / total) * 100 : 0).toFixed(1)}%`

  return (
    <div className={d.wrap} role="group" aria-label={caption}>
      <div className={d.donut} style={{ width: size, height: size }}>
        <svg width={size} height={size} aria-hidden>
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill)" strokeWidth={thickness} />
            {segments.map((segment, i) => (
              <circle
                key={segment.label}
                className={cx(s.bar, active !== null && active !== i && s.dim)}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={segment.color}
                strokeWidth={thickness}
                strokeDasharray={`${segment.dash} ${circumference - segment.dash}`}
                strokeDashoffset={-segment.offset}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
              />
            ))}
          </g>
        </svg>
        <div className={d.center}>
          <strong>{focus ? pct(focus.value) : center.value}</strong>
          <span>{focus ? focus.label : center.label}</span>
        </div>
      </div>

      <ul className={d.legend}>
        {data.map((part, i) => (
          <li
            key={part.label}
            className={cx(d.row, active === i && d.rowActive)}
            onPointerEnter={() => setActive(i)}
            onPointerLeave={() => setActive(null)}
          >
            <span className={s.keyDot} style={{ '--key': part.color }} aria-hidden />
            <span className={d.label}>{part.label}</span>
            <span className={d.value}>{format(part.value)}</span>
            <span className={d.pct}>{pct(part.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
