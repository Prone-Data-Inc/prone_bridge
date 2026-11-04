/* Number and time formatting for the interface. Money formatting lives in shared/src/money.js. */
const LOCALE = 'en-US'

const number = new Intl.NumberFormat(LOCALE)
const compactFormat = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 })

export const formatNumber = (value) => number.format(value)

/* 1200 -> 1.2K, 3400000 -> 3.4M. Used on chart axes. */
export const compact = (value) => compactFormat.format(value)

/* 0.1234 -> 12.3%. With signed, a positive value gets a plus sign: +4.2%. */
export function percent(fraction, { signed = false, digits = 1 } = {}) {
  const text = `${(Math.abs(fraction) * 100).toFixed(digits)}%`
  if (fraction < 0) return `-${text}`
  return signed && fraction > 0 ? `+${text}` : text
}

const UNITS = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

/* "just now", "5 min ago", "3 h ago", "2 d ago", then a short date. */
export function timeAgo(value, now = Date.now()) {
  const then = new Date(value).getTime()
  const diff = Math.max(0, now - then)
  if (diff < 60_000) return 'just now'
  const [unit, size] = UNITS.find(([, ms]) => diff >= ms)
  const count = Math.floor(diff / size)
  if (unit === 'day' && count > 6) return new Date(then).toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' })
  return `${count} ${{ day: 'd', hour: 'h', minute: 'min' }[unit]} ago`
}

/* Two letters for an avatar: "Aminata Diallo" -> "AD", "Prone Data Learning" -> "PL". */
export function initials(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words.at(-1)[0]).toUpperCase()
}
