/* Where buyers can pay, and with which methods. For each country: how many visitors came, how many paid, where the
   others gave up, and every payment method with a switch. Turning a method off hides it from buyers in that country at once. */
import { useState } from 'react'
import { setMethod, getCountries } from '@/api/seller.js'
import { useSellerData } from '@/hooks/useSellerData.js'
import { formatNumber, percent } from '@/lib/format.js'
import { toast } from '@/stores/toasts.js'
import Badge from '@/ui/Badge.jsx'
import { Card } from '@/ui/Card.jsx'
import { Toggle } from '@/ui/Field.jsx'
import PageHeader from '@/ui/PageHeader.jsx'
import { Skeleton } from '@/ui/States.jsx'
import p from '../Page.module.css'
import { usd } from './format.js'
import { DataState, RangeSwitch } from './parts.jsx'
import s from './Seller.module.css'

const WATCH = ['payments']

const without = (map, id) => Object.fromEntries(Object.entries(map).filter(([key]) => key !== id))

const STATUS = {
  operational: null,
  degraded: { tone: 'warning', label: 'Slow' },
  down: { tone: 'danger', label: 'Down' },
}

const LEFT = [
  { key: 'country', label: 'Left at the country', color: 'var(--series-2)' },
  { key: 'method', label: 'Had no method they use', color: 'var(--warning)' },
  { key: 'payment', label: 'Left at payment', color: 'var(--series-other)' },
]

function Left({ country }) {
  const total = LEFT.reduce((sum, part) => sum + country.leftAt[part.key], 0)
  if (total === 0) return null
  return (
    <div className={s.left}>
      <div className={s.leftBar} role="img" aria-label={`${total} visitors left without paying`}>
        {LEFT.map((part) => (
          <span
            key={part.key}
            style={{ width: `${(country.leftAt[part.key] / total) * 100}%`, background: part.color }}
          />
        ))}
      </div>
      <p className={s.leftLegend}>
        {LEFT.filter((part) => country.leftAt[part.key] > 0).map((part) => (
          <span key={part.key}>
            {part.label}: {country.leftAt[part.key]}
          </span>
        ))}
      </p>
    </div>
  )
}

function Method({ country, method, enabled, busy, onToggle }) {
  const corridor = STATUS[method.status]
  const detail =
    method.attempts === 0
      ? 'No payments in this period'
      : `${formatNumber(method.paid)} paid, ${percent(method.successRate, { digits: 0 })} succeed, ${usd(method.grossUsdCents)}`

  return (
    <li className={s.method}>
      <div className={s.methodInfo}>
        <span className={s.methodName}>
          {method.label}
          <span className={s.tag}>{method.simulated ? 'Simulated' : 'PayPal sandbox'}</span>
          {corridor && (
            <Badge tone={corridor.tone} dot>
              {corridor.label}
            </Badge>
          )}
        </span>
        <span className={s.cellSub}>
          {method.platformEnabled ? detail : 'ProneBridge has not opened this here yet'}
        </span>
      </div>
      {method.platformEnabled && (
        <Toggle
          checked={enabled}
          disabled={busy}
          onChange={(checked) => onToggle(country, method, checked)}
          label={<span className="sr-only">{`${method.label} in ${country.name}`}</span>}
        />
      )}
    </li>
  )
}

export default function Countries() {
  const [days, setDays] = useState(30)
  /* What the seller just switched, shown at once while the server confirms: { 'KE:mobile_money': true }. */
  const [switched, setSwitched] = useState({})
  const [busy, setBusy] = useState({})
  const state = useSellerData(() => getCountries({ days }), String(days), { watch: WATCH })

  const key = (country, method) => `${country.code}:${method.id}`

  async function toggle(country, method, enabled) {
    const id = key(country, method)
    setSwitched((now) => ({ ...now, [id]: enabled }))
    setBusy((now) => ({ ...now, [id]: true }))
    try {
      await setMethod(country.code, method.id, enabled)
      await state.reload({ quiet: true })
      toast(`${method.label} is ${enabled ? 'on' : 'off'} in ${country.name}.`, {
        tone: enabled ? 'success' : 'neutral',
      })
    } catch (error) {
      toast(error.message, { tone: 'danger' })
    } finally {
      setSwitched((now) => without(now, id))
      setBusy((now) => without(now, id))
    }
  }

  const countries = [...(state.data?.countries ?? [])].sort(
    (a, b) => b.grossUsdCents - a.grossUsdCents || a.name.localeCompare(b.name),
  )
  const live = countries.filter((country) => country.live).length
  const visits = countries.reduce((sum, country) => sum + country.visits, 0)
  const paid = countries.reduce((sum, country) => sum + country.paidVisits, 0)

  return (
    <div className={p.page}>
      <PageHeader
        title="Countries and methods"
        subtitle="Where buyers can pay, and with which methods."
        actions={<RangeSwitch value={days} onChange={setDays} />}
      />

      <DataState
        state={state}
        onRetry={state.reload}
        skeleton={
          <div className={s.countries}>
            {[0, 1, 2, 3].map((id) => (
              <Skeleton key={id} height={320} radius={16} />
            ))}
          </div>
        }
      >
        {state.data && (
          <>
            <Card>
              <dl className={s.facts}>
                <div className={s.fact}>
                  <dt>Countries open</dt>
                  <dd>
                    {live} of {countries.length}
                  </dd>
                </div>
                <div className={s.fact}>
                  <dt>Visitors</dt>
                  <dd>{formatNumber(visits)}</dd>
                </div>
                <div className={s.fact}>
                  <dt>Paid</dt>
                  <dd>
                    {formatNumber(paid)}
                    <small>{visits > 0 ? `${percent(paid / visits)} of visitors` : ' '}</small>
                  </dd>
                </div>
              </dl>
            </Card>

            <div className={s.countries}>
              {countries.map((country) => (
                <section key={country.code} className={s.country} aria-label={country.name}>
                  <div className={s.countryHead}>
                    <div>
                      <h2 className={s.countryName}>{country.name}</h2>
                      <p className={s.cellSub}>
                        {country.region}. Buyers pay in {country.currency}.
                      </p>
                    </div>
                    <Badge tone={country.live ? 'success' : 'neutral'} dot>
                      {country.live ? 'Open' : 'Closed'}
                    </Badge>
                  </div>

                  <dl className={s.countryStats}>
                    <div>
                      <dt>Visitors</dt>
                      <dd>{formatNumber(country.visits)}</dd>
                    </div>
                    <div>
                      <dt>Converted</dt>
                      <dd>{country.visits > 0 ? percent(country.conversion, { digits: 0 }) : 'None'}</dd>
                    </div>
                    <div>
                      <dt>Volume</dt>
                      <dd>{usd(country.grossUsdCents)}</dd>
                    </div>
                  </dl>

                  <Left country={country} />

                  <ul className={s.methods}>
                    {country.methods.map((method) => {
                      const id = key(country, method)
                      return (
                        <Method
                          key={method.id}
                          country={country}
                          method={method}
                          enabled={switched[id] ?? method.enabled}
                          busy={Boolean(busy[id])}
                          onToggle={toggle}
                        />
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </DataState>
    </div>
  )
}
