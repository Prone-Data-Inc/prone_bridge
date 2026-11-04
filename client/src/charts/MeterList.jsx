/* Ranked horizontal bars: label, a bar on a lighter track, value. data: [{ label, value }]. */
import s from './MeterList.module.css'

export default function MeterList({ data, format, caption, color = 'var(--series-1)' }) {
  const max = Math.max(0, ...data.map((item) => item.value))

  return (
    <ul className={s.list} aria-label={caption} style={{ '--color': color }}>
      {data.map((item) => (
        <li key={item.label} className={s.row}>
          <span className={s.label}>{item.label}</span>
          <span className={s.track} aria-hidden>
            <span className={s.fill} style={{ width: `${max ? (item.value / max) * 100 : 0}%` }} />
          </span>
          <span className={s.value}>{format(item.value)}</span>
        </li>
      ))}
    </ul>
  )
}
