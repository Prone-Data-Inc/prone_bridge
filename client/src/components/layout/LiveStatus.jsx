/* A small dot that says whether live updates are on. When they are not, the app still refreshes every few seconds. */
import { cx } from '@/lib/cx.js'
import { useRealtime } from '@/stores/realtime.js'
import s from './LiveStatus.module.css'

const TEXT = {
  live: { label: 'Live', hint: 'Changes appear as they happen.' },
  connecting: { label: 'Connecting', hint: 'Connecting to live updates.' },
  off: { label: 'Refreshing', hint: 'Live updates are off here. The app refreshes every few seconds.' },
  closed: { label: 'Refreshing', hint: 'Live updates dropped. The app refreshes every few seconds.' },
  error: { label: 'Refreshing', hint: 'Live updates are unavailable. The app refreshes every few seconds.' },
}

export default function LiveStatus() {
  const status = useRealtime((state) => state.status)
  const { label, hint } = TEXT[status] ?? TEXT.connecting

  return (
    <span className={cx(s.live, s[status])} title={hint} role="status">
      <span className={s.dot} aria-hidden />
      <span className={s.label}>{label}</span>
    </span>
  )
}
