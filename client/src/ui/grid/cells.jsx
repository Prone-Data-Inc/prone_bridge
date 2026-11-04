/* Cell renderers for the data grid: a status pill, a payment method with its "Simulated" label, a country with its
   currency, and money. Each reads params.value (and params.data for the neighbours). */
import Badge from '@/ui/Badge.jsx'
import { statusLabel, statusTone } from '@/lib/status.js'
import { formatUsd } from '#shared/money.js'
import s from './cells.module.css'

export function StatusCell({ value }) {
  return (
    <Badge tone={statusTone(value)} dot>
      {statusLabel(value)}
    </Badge>
  )
}

/* params.data.simulated marks a method that is a labeled simulation, never a real integration. */
export function MethodCell({ value, data }) {
  return (
    <span className={s.method}>
      {value}
      {data?.simulated && <span className={s.tag}>Simulated</span>}
    </span>
  )
}

export function CountryCell({ value, data }) {
  return (
    <span className={s.country}>
      <span className={s.code}>{data?.countryCode}</span>
      {value}
    </span>
  )
}

export function MoneyCell({ value }) {
  return <span className={s.money}>{value == null ? '' : formatUsd(value)}</span>
}
