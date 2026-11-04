/* Chart math: clean axis ticks, monotone curve paths (no overshoot) and column shapes. */

/* Clean ticks up to `max`. A chart with no data, or only zeros, still gets a readable axis instead of NaN. */
export function niceScale(max, count = 3) {
  const raw = (Number.isFinite(max) && max > 0 ? max : 0) / count || 1
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((value) => value >= raw)
  return { max: step * count, ticks: Array.from({ length: count + 1 }, (_, i) => i * step) }
}

/* Fritsch-Carlson monotone cubic through [x, y] points. Two points give a straight line. */
export function monotonePath(points) {
  const n = points.length
  if (n < 2) return ''
  const dx = []
  const slope = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1][0] - points[i][0]
    slope[i] = (points[i + 1][1] - points[i][1]) / dx[i]
  }
  const tangent = [slope[0]]
  for (let i = 1; i < n - 1; i++) {
    tangent[i] =
      slope[i - 1] * slope[i] <= 0
        ? 0
        : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / slope[i - 1] + (dx[i] + 2 * dx[i - 1]) / slope[i])
  }
  tangent[n - 1] = slope[n - 2]

  let d = `M${points[0][0]},${points[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    d += `C${x0 + h},${y0 + tangent[i] * h} ${x1 - h},${y1 - tangent[i + 1] * h} ${x1},${y1}`
  }
  return d
}

/* A column with a rounded data end (top) and a square baseline. */
export function columnPath(x, y, width, base, radius = 4) {
  const r = Math.min(radius, width / 2, base - y)
  return `M${x},${base}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + width - r}A${r},${r} 0 0 1 ${x + width},${y + r}V${base}Z`
}
