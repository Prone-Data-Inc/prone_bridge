/* Multi-series line chart: smooth curves, an optional area wash, a crosshair and tooltip on hover or arrow keys, and a
   table for screen readers. series: [{ label, values, color, area?, dashed? }], format(value) -> text. */
import { useId, useState } from 'react'
import { useElementSize } from '@/hooks/useElementSize.js'
import { compact } from '@/lib/format.js'
import ChartTooltip from './ChartTooltip.jsx'
import { monotonePath, niceScale } from './geometry.js'
import s from './Charts.module.css'

const PAD = { top: 12, right: 12, bottom: 28, left: 44 }

export default function LineChart({ labels, series, format, caption, height = 240 }) {
  const gradientId = useId()
  const [ref, width] = useElementSize()
  const [index, setIndex] = useState(null)

  if (!labels.length) return <p className={s.none}>No data yet.</p>

  const last = Math.max(1, labels.length - 1)
  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = height - PAD.top - PAD.bottom
  const { max, ticks } = niceScale(Math.max(...series.flatMap((item) => item.values)))
  const x = (i) => PAD.left + (i * plotW) / last
  const y = (value) => PAD.top + plotH - (value / max) * plotH
  const clamp = (i) => Math.max(0, Math.min(labels.length - 1, i))
  const area = series.find((item) => item.area)
  /* With many labels, show about six so they never collide. */
  const labelEvery = Math.max(1, Math.ceil(labels.length / 6))

  /* The pointer is in screen pixels and the chart is drawn in the page's pixels. On a zoomed screen they differ, so the
     pointer is turned into a share of the chart's width first. */
  const onPointerMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - box.left) * (box.width ? width / box.width : 1)
    setIndex(clamp(Math.round(((x - PAD.left) / plotW) * last)))
  }

  const onKeyDown = (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    setIndex((i) => clamp(i === null ? 0 : i + step))
  }

  return (
    <div
      ref={ref}
      className={s.chart}
      tabIndex={0}
      aria-label={caption}
      onKeyDown={onKeyDown}
      onBlur={() => setIndex(null)}
    >
      {width > 0 && (
        <svg
          width={width}
          height={height}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setIndex(null)}
          aria-hidden
        >
          {area && (
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: area.color, stopOpacity: 0.16 }} />
                <stop offset="1" style={{ stopColor: area.color, stopOpacity: 0 }} />
              </linearGradient>
            </defs>
          )}

          {ticks.map((tick) => (
            <g key={tick}>
              <line className={s.grid} x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} />
              <text className={s.axis} x={PAD.left - 12} y={y(tick)} dy="0.32em" textAnchor="end">
                {compact(tick)}
              </text>
            </g>
          ))}
          {labels.map(
            (label, i) =>
              i % labelEvery === 0 && (
                <text key={`${label}-${i}`} className={s.axis} x={x(i)} y={height - 6} textAnchor="middle">
                  {label}
                </text>
              ),
          )}

          {series.map((item) => {
            const d = monotonePath(item.values.map((value, i) => [x(i), y(value)]))
            return (
              <g key={item.label}>
                {item.area && d && (
                  <path d={`${d}L${x(labels.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={`url(#${gradientId})`} />
                )}
                <path
                  d={d}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={item.dashed ? '4 5' : undefined}
                />
              </g>
            )
          })}

          {index !== null && (
            <g>
              <line className={s.crosshair} x1={x(index)} x2={x(index)} y1={PAD.top} y2={PAD.top + plotH} />
              {series.map((item) => (
                <circle
                  key={item.label}
                  className={s.ring}
                  cx={x(index)}
                  cy={y(item.values[index])}
                  r={4}
                  fill={item.color}
                />
              ))}
            </g>
          )}
        </svg>
      )}

      {index !== null && (
        <ChartTooltip
          x={x(index)}
          y={PAD.top}
          width={width}
          title={labels[index]}
          rows={series.map((item) => ({
            label: item.label,
            value: format(item.values[index]),
            color: item.color,
            dashed: item.dashed,
          }))}
        />
      )}

      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <td />
            {series.map((item) => (
              <th key={item.label}>{item.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, i) => (
            <tr key={`${label}-${i}`}>
              <th>{label}</th>
              {series.map((item) => (
                <td key={item.label}>{format(item.values[i])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
