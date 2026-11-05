/* The seller's home: how the business is doing, in numbers, a trend, where the money comes from and what is waiting. */
import { useState } from 'react'
import { ArrowRight, Info, WarningCircle } from '@phosphor-icons/react'
import { getOverview } from '@/api/seller.js'
import DonutChart from '@/charts/DonutChart.jsx'
import Legend from '@/charts/Legend.jsx'
import LineChart from '@/charts/LineChart.jsx'
import MeterList from '@/charts/MeterList.jsx'
import Sparkline from '@/charts/Sparkline.jsx'
import { useSellerData } from '@/hooks/useSellerData.js'
import { formatNumber, percent } from '@/lib/format.js'
import { statusLabel, statusTone } from '@/lib/status.js'
import { useNav } from '@/stores/nav.js'
import Badge from '@/ui/Badge.jsx'
import { Button } from '@/ui/Button.jsx'
import { Card, StatCard } from '@/ui/Card.jsx'
import PageHeader from '@/ui/PageHeader.jsx'
import { EmptyState, Skeleton } from '@/ui/States.jsx'
import Table from '@/ui/Table.jsx'
import p from '../Page.module.css'
import PaymentDetail from './PaymentDetail.jsx'
import { dayLabel, deltaOf, dollars, usd } from './format.js'
import { DataState, RangeSwitch } from './parts.jsx'
import s from './Seller.module.css'

const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)']
const toDollars = (cents) => cents / 100

/* Rates move in points: 93.4% against 92.2% is +1.2, not +1.3%. */
const pointsOf = (metric) => (metric.previous > 0 ? metric.value - metric.previous : undefined)

/* The four biggest methods, and the rest together, so the donut never has more parts than it can show. */
function methodParts(methods) {
  const top = methods.slice(0, 3).map((method, index) => ({
    label: method.label,
    value: toDollars(method.grossUsdCents),
    color: SERIES[index],
  }))
  const rest = methods.slice(3).reduce((sum, method) => sum + method.grossUsdCents, 0)
  return rest > 0 ? [...top, { label: 'Other', value: toDollars(rest), color: SERIES[3] }] : top
}

function Skeletons() {
  return (
    <>
      <div className={s.stats}>
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} height={132} radius={16} />
        ))}
      </div>
      <div className={s.split}>
        <Skeleton height={360} radius={16} />
        <Skeleton height={360} radius={16} />
      </div>
    </>
  )
}

function Attention({ items }) {
  const go = useNav((state) => state.go)
  if (!items.length) return null
  return (
    <ul className={s.attention} aria-label="Worth a look">
      {items.map((item) => (
        <li key={item.message} className={s.alert} data-level={item.level}>
          {item.level === 'info' ? <Info size={20} aria-hidden /> : <WarningCircle size={20} aria-hidden />}
          <span className={s.alertText}>{item.message}</span>
          <Button size="sm" iconRight={ArrowRight} onClick={() => go('seller', item.section)}>
            {item.section === 'payouts' ? 'Payouts' : 'Countries'}
          </Button>
        </li>
      ))}
    </ul>
  )
}

function Body({ data, days, onOpen }) {
  const go = useNav((state) => state.go)
  const { kpis, series } = data
  const labels = series.days.map(dayLabel)
  const empty = kpis.payments.value === 0 && kpis.gross.previous === 0

  if (empty) {
    return (
      <EmptyState icon={Info} title="No sales yet">
        Sales show up here as they happen. Share a payment link to get the first one.
      </EmptyState>
    )
  }

  return (
    <>
      <Attention items={data.attention} />

      <div className={s.stats}>
        <StatCard label="Volume" value={usd(kpis.gross.value)} delta={deltaOf(kpis.gross)} tone={1}>
          <Sparkline values={series.gross.map(toDollars)} caption={`Volume over ${days} days`} />
        </StatCard>
        <StatCard label="You keep, after fees" value={usd(kpis.net.value)} delta={deltaOf(kpis.net)} tone={2}>
          <p className={s.note}>
            {kpis.gross.value > 0 ? `${percent(1 - kpis.net.value / kpis.gross.value)} goes to fees` : ' '}
          </p>
        </StatCard>
        <StatCard label="Payments" value={formatNumber(kpis.payments.value)} delta={deltaOf(kpis.payments)} tone={1}>
          <Sparkline values={series.payments} color="var(--series-3)" caption={`Payments over ${days} days`} />
        </StatCard>
        <StatCard
          label="Checkout conversion"
          value={percent(kpis.conversion.value)}
          delta={pointsOf(kpis.conversion)}
          tone={2}
        >
          <p className={s.note}>Visitors who went on to pay</p>
        </StatCard>
      </div>

      <div className={s.split}>
        <div className={s.stack}>
          <Card
            title="Volume"
            action={
              <Legend
                items={[
                  { label: 'This period', color: 'var(--series-1)' },
                  { label: 'Before', color: 'var(--series-other)', dashed: true },
                ]}
              />
            }
          >
            <LineChart
              labels={labels}
              caption={`Volume by day, last ${days} days`}
              format={dollars}
              series={[
                { label: 'This period', values: series.gross.map(toDollars), color: 'var(--series-1)', area: true },
                {
                  label: 'Before',
                  values: series.previousGross.map(toDollars),
                  color: 'var(--series-other)',
                  dashed: true,
                },
              ]}
            />
          </Card>

          <Card
            title="Latest payments"
            action={
              <Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => go('seller', 'payments')}>
                All payments
              </Button>
            }
            flush
          >
            <Table
              caption="Latest payments"
              rows={data.recent}
              onRowClick={(row) => onOpen(row.id)}
              empty="No payments yet."
              columns={[
                {
                  key: 'reference',
                  label: 'Payment',
                  render: (row) => <span className={s.mono}>{row.reference}</span>,
                },
                { key: 'buyer', label: 'Customer', render: (row) => row.buyer.name },
                { key: 'method', label: 'Method', render: (row) => row.method.label },
                { key: 'amount', label: 'Amount', align: 'right', render: (row) => usd(row.amountUsdCents) },
                {
                  key: 'status',
                  label: 'Status',
                  render: (row) => (
                    <Badge tone={statusTone(row.status)} dot>
                      {statusLabel(row.status)}
                    </Badge>
                  ),
                },
              ]}
            />
          </Card>
        </div>

        <div className={s.stack}>
          <Card title="Next payout">
            <div className={s.balance}>
              <strong className={s.balanceValue}>{usd(data.balance.owedUsdCents)}</strong>
              <span className={s.muted}>
                {data.balance.owedPayments === 0
                  ? 'Nothing is waiting.'
                  : `${formatNumber(data.balance.owedPayments)} paid ${data.balance.owedPayments === 1 ? 'sale' : 'sales'}, after fees`}
              </span>
              <Button variant="primary" iconRight={ArrowRight} onClick={() => go('seller', 'payouts')}>
                Go to payouts
              </Button>
            </div>
          </Card>

          <Card title="Payment methods">
            <DonutChart
              caption="Share of volume by method"
              format={(value) => usd(Math.round(value * 100))}
              center={{ value: usd(kpis.gross.value), label: 'Volume' }}
              data={methodParts(data.methods)}
            />
          </Card>

          <Card title="Top countries">
            <MeterList
              caption="Volume by country"
              format={(value) => usd(Math.round(value * 100))}
              data={data.countries.slice(0, 6).map((country) => ({
                label: country.name,
                value: toDollars(country.grossUsdCents),
              }))}
            />
          </Card>
        </div>
      </div>
    </>
  )
}

export default function Overview() {
  const [days, setDays] = useState(30)
  const [open, setOpen] = useState(null)
  const state = useSellerData(() => getOverview({ days }), String(days))

  return (
    <div className={p.page}>
      <PageHeader
        title="Overview"
        subtitle="Your sales at a glance."
        actions={<RangeSwitch value={days} onChange={setDays} />}
      />
      <DataState state={state} onRetry={state.reload} skeleton={<Skeletons />}>
        {state.data && <Body data={state.data} days={days} onOpen={setOpen} />}
      </DataState>
      {open && <PaymentDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
