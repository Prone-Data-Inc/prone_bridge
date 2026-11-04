/* Single-series column chart: one color, thin columns with rounded tops, the peak labelled on its cap, a tooltip on hover
   or focus, and a table for screen readers. data: [{ label, value }], format(value) -> text. */
import { useState } from 'react'
import { useElementSize } from '@/hooks/useElementSize.js'
import { cx } from '@/lib/cx.js'
import { compact } from '@/lib/format.js'
import ChartTooltip from './ChartTooltip.jsx'
import { columnPath, niceScale } from './geometry.js'
import s from './Charts.module.css'

const PAD = { top: 24, right: 0, bottom: 28, left: 44 }
const MAX_BAR = 24

export default function BarChart({ data, seriesLabel, format, caption, color = 'var(--series-1)', height = 240 }) {
  const [ref, width] = useElementSize()
  const [index, setIndex] = useState(null)

  if (!data.length) return <p className={s.none}>No data yet.</p>

  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = height - PAD.top - PAD.bottom
  const base = PAD.top + plotH
  const band = plotW / data.length
  const barW = Math.min(MAX_BAR, band * 0.5)
  const { max, ticks } = niceScale(Math.max(...data.map((item) => item.value)))
  const peak = data.reduce((best, item, i) => (item.value > data[best].value ? i : best), 0)
  const x = (i) => PAD.left + i * band + (band - barW) / 2
  const y = (value) => base - (value / max) * plotH
  const labelEvery = Math.max(1, Math.ceil(data.length / 8))

  return (
    <div ref={ref} className={s.chart}>
      {width > 0 && (
        <svg width={width} height={height} role="group" aria-label={caption}>
          {ticks.map((tick) => (
            <g key={tick} aria-hidden>
              <line className={s.grid} x1={PAD.left} x2={width} y1={y(tick)} y2={y(tick)} />
              <text className={s.axis} x={PAD.left - 12} y={y(tick)} dy="0.32em" textAnchor="end">
                {compact(tick)}
              </text>
            </g>
          ))}

          {data.map((item, i) => (
            <g key={`${item.label}-${i}`}>
              <path
                className={cx(s.bar, index !== null && index !== i && s.dim)}
                d={columnPath(x(i), y(item.value), barW, base)}
                fill={color}
              />
              {i === peak && item.value > 0 && (
                <text className={s.capLabel} x={x(i) + barW / 2} y={y(item.value) - 8} textAnchor="middle" aria-hidden>
                  {format(item.value)}
                </text>
              )}
              {i % labelEvery === 0 && (
                <text className={s.axis} x={x(i) + barW / 2} y={height - 6} textAnchor="middle" aria-hidden>
                  {item.label}
                </text>
              )}
              <rect
                className={s.hit}
                x={PAD.left + i * band}
                y={PAD.top}
                width={band}
                height={plotH}
                tabIndex={0}
                aria-label={`${item.label}: ${format(item.value)}`}
                onPointerEnter={() => setIndex(i)}
                onPointerLeave={() => setIndex(null)}
                onFocus={() => setIndex(i)}
                onBlur={() => setIndex(null)}
              />
            </g>
          ))}
        </svg>
      )}

      {index !== null && (
        <ChartTooltip
          x={x(index) + barW / 2}
          y={Math.max(0, y(data[index].value) - 24)}
          width={width}
          title={data[index].label}
          rows={[{ label: seriesLabel, value: format(data[index].value), color }]}
        />
      )}

      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {data.map((item, i) => (
            <tr key={`${item.label}-${i}`}>
              <th>{item.label}</th>
              <td>{format(item.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
