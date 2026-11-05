/* Corridors: every payment method in every country, and how healthy it is. The admin marks one as slow or down, and every
   seller that uses it is told. Buyers stop seeing a method that is down, and Method Match puts a slow one lower. */
import { useState } from 'react'
import { getCorridors, setCorridor } from '@/api/admin.js'
import { useSellerData } from '@/hooks/useSellerData.js'
import { formatNumber, percent } from '@/lib/format.js'
import { toast } from '@/stores/toasts.js'
import Badge from '@/ui/Badge.jsx'
import { Card } from '@/ui/Card.jsx'
import { Toggle } from '@/ui/Field.jsx'
import PageHeader from '@/ui/PageHeader.jsx'
import { Skeleton } from '@/ui/States.jsx'
import p from '../Page.module.css'
import { usd } from '../seller/format.js'
import { DataState, RangeSwitch } from '../seller/parts.jsx'
import s from '../seller/Seller.module.css'
import a from './Admin.module.css'
import { CORRIDOR_STATUS } from './risk.js'

const WATCH = ['payments']

const without = (map, id) => Object.fromEntries(Object.entries(map).filter(([key]) => key !== id))
const STATUS = { degraded: { tone: 'warning', label: 'Slow' }, down: { tone: 'danger', label: 'Down' } }

function Method({ corridor, busy, onChange }) {
  const { method } = corridor
  const flag = STATUS[corridor.status]
  const detail =
    corridor.attempts === 0
      ? 'No payments in this period'
      : `${formatNumber(corridor.paid)} paid, ${percent(corridor.successRate, { digits: 0 })} succeed, ${usd(corridor.grossUsdCents)}`
  const label = `${method.label} in ${corridor.countryName}`

  return (
    <li className={s.method}>
      <div className={s.methodInfo}>
        <span className={s.methodName}>
          {method.label}
          <span className={s.tag}>{corridor.simulated ? 'Simulated' : 'PayPal sandbox'}</span>
          {flag && corridor.enabled && (
            <Badge tone={flag.tone} dot>
              {flag.label}
            </Badge>
          )}
          {!corridor.enabled && <Badge>Paused</Badge>}
        </span>
        <span className={s.cellSub}>
          {detail}. {corridor.sellersOn} {corridor.sellersOn === 1 ? 'seller uses' : 'sellers use'} it.
        </span>
      </div>
      <div className={a.picker}>
        <select
          className={a.statusSelect}
          aria-label={`Health of ${label}`}
          value={corridor.status}
          disabled={busy}
          onChange={(event) => onChange(corridor, { status: event.target.value })}
        >
          {CORRIDOR_STATUS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Toggle
          checked={corridor.enabled}
          disabled={busy}
          onChange={(enabled) => onChange(corridor, { enabled })}
          label={<span className="sr-only">{`${label} is open`}</span>}
        />
      </div>
    </li>
  )
}

export default function Corridors() {
  const [days, setDays] = useState(30)
  const [problemsOnly, setProblemsOnly] = useState(false)
  /* What was just changed, shown at once while the server confirms: { 'KE:mobile_money': { status: 'down' } }. */
  const [pending, setPending] = useState({})
  const state = useSellerData(() => getCorridors({ days }), String(days), { watch: WATCH })

  const key = (corridor) => `${corridor.countryCode}:${corridor.method.id}`

  async function change(corridor, patch) {
    const id = key(corridor)
    setPending((now) => ({ ...now, [id]: patch }))
    try {
      await setCorridor(corridor.countryCode, corridor.method.id, patch)
      await state.reload({ quiet: true })
      const what = `${corridor.method.label} in ${corridor.countryName}`
      toast(
        patch.status
          ? `${what} is now marked ${CORRIDOR_STATUS.find((option) => option.value === patch.status).label.toLowerCase()}. Sellers that use it were told.`
          : `${what} is ${patch.enabled ? 'open again' : 'paused'}. Sellers that use it were told.`,
        { tone: patch.status === 'down' || patch.enabled === false ? 'warning' : 'success' },
      )
    } catch (error) {
      toast(error.message, { tone: 'danger' })
    } finally {
      setPending((now) => without(now, id))
    }
  }

  const all = (state.data?.corridors ?? []).map((corridor) => ({ ...corridor, ...pending[key(corridor)] }))
  const shown = problemsOnly ? all.filter((corridor) => !corridor.enabled || corridor.status !== 'operational') : all
  const countries = [...new Set(shown.map((corridor) => corridor.countryName))].sort((x, y) => x.localeCompare(y))
  const summary = state.data?.summary

  return (
    <div className={p.page}>
      <PageHeader
        title="Corridors"
        subtitle="Payment methods by country, and their health."
        actions={<RangeSwitch value={days} onChange={setDays} />}
      />

      <DataState
        state={state}
        onRetry={state.reload}
        skeleton={
          <div className={s.countries}>
            {[0, 1, 2, 3].map((id) => (
              <Skeleton key={id} height={260} radius={16} />
            ))}
          </div>
        }
      >
        {state.data && (
          <>
            <Card>
              <div className={s.filters}>
                <dl className={`${s.facts} ${a.grow}`}>
                  <div className={s.fact}>
                    <dt>Working</dt>
                    <dd>{summary.operational}</dd>
                  </div>
                  <div className={s.fact}>
                    <dt>Slow</dt>
                    <dd>{summary.degraded}</dd>
                  </div>
                  <div className={s.fact}>
                    <dt>Down</dt>
                    <dd>{summary.down}</dd>
                  </div>
                </dl>
                <Toggle checked={problemsOnly} onChange={setProblemsOnly} label="Only show problems" />
              </div>
            </Card>
            <p className={s.note}>
              Marking a method slow tells its sellers and moves it down in Method Match. Marking it down, or pausing it,
              hides it from buyers at once. All of this is simulated: no real provider is connected.
            </p>

            <div className={s.countries}>
              {countries.map((name) => {
                const rows = shown.filter((corridor) => corridor.countryName === name)
                return (
                  <section key={name} className={s.country} aria-label={name}>
                    <div className={s.countryHead}>
                      <div>
                        <h2 className={s.countryName}>{name}</h2>
                        <p className={s.cellSub}>{rows[0].region}</p>
                      </div>
                    </div>
                    <ul className={s.methods}>
                      {rows.map((corridor) => (
                        <Method
                          key={key(corridor)}
                          corridor={corridor}
                          busy={Boolean(pending[key(corridor)])}
                          onChange={change}
                        />
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>
            {countries.length === 0 && <p className={s.muted}>Every corridor is working.</p>}
          </>
        )}
      </DataState>
    </div>
  )
}
