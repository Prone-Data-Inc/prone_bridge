/* A tiny trend line with no axes, for KPI tiles. Draws at the width of its container. */
import { useId } from 'react'
import { useElementSize } from '@/hooks/useElementSize.js'
import { monotonePath } from './geometry.js'

export default function Sparkline({ values, color = 'var(--series-1)', height = 36, caption }) {
  const gradientId = useId()
  const [ref, width] = useElementSize()
  const min = Math.min(...values)
  const range = Math.max(...values) - min || 1
  const pad = 3
  const x = (i) => (i * width) / Math.max(1, values.length - 1)
  const y = (value) => height - pad - ((value - min) / range) * (height - pad * 2)
  const d = values.length > 1 ? monotonePath(values.map((value, i) => [x(i), y(value)])) : ''

  return (
    <div
      ref={ref}
      style={{ width: '100%', height }}
      role={caption ? 'img' : undefined}
      aria-label={caption}
      aria-hidden={caption ? undefined : true}
    >
      {width > 0 && d && (
        <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: color, stopOpacity: 0.18 }} />
              <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path d={`${d}L${width},${height}L0,${height}Z`} fill={`url(#${gradientId})`} />
          <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  )
}
