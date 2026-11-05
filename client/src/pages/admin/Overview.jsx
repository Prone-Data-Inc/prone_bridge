/* The admin's home: how the whole network is doing, what the risk rules did, what waits for a person and which corridors
   are in trouble. */
import { useState } from 'react'
import { ArrowRight, Info, WarningCircle } from '@phosphor-icons/react'
import { getOverview } from '@/api/admin.js'
import DonutChart from '@/charts/DonutChart.jsx'
import Legend from '@/charts/Legend.jsx'
import LineChart from '@/charts/LineChart.jsx'
import Sparkline from '@/charts/Sparkline.jsx'
import { useSellerData } from '@/hooks/useSellerData.js'
import { compact, formatNumber, percent, timeAgo } from '@/lib/format.js'
import { useNav } from '@/stores/nav.js'
import Badge from '@/ui/Badge.jsx'
import { Button } from '@/ui/Button.jsx'
import { Card, StatCard } from '@/ui/Card.jsx'
import PageHeader from '@/ui/PageHeader.jsx'
import { EmptyState, Skeleton } from '@/ui/States.jsx'
import Table from '@/ui/Table.jsx'
import p from '../Page.module.css'
import { dayLabel, deltaOf, dollars, usd } from '../seller/format.js'
import { DataState, RangeSwitch } from '../seller/parts.jsx'
import s from '../seller/Seller.module.css'
import a from './Admin.module.css'
import { RiskBadge } from './parts.jsx'
import { statusLabel } from '@/lib/status.js'

const WATCH = ['payments', 'payouts', 'notifications', 'risk_assessments']
const toDollars = (cents) => cents / 100

/* Rates move in points: 93.4% against 92.2% is +1.2, not +1.3%. */
const pointsOf = (metric) => (metric.previous > 0 ? metric.value - metric.previous : undefined)

const SECTION_LABEL = { review: 'Open the queue', corridors: 'Corridors', overview: 'Overview' }

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
          {item.section !== 'overview' && (
            <Button size="sm" iconRight={ArrowRight} onClick={() => go('admin', item.section)}>
              {SECTION_LABEL[item.section] ?? 'Open'}
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

function AiCard({ ai }) {
  if (!ai.enabled) {
    return (
      <Card title="AI today">
        <p className={s.muted}>
          The AI is not connected. Risk notes use the rules' own words, and the seller copilot is off.
        </p>
      </Card>
    )
  }
  const used = Math.min(1, ai.usedTokens / ai.dailyTokenBudget)
  return (
    <Card title="AI today">
      <div className={a.budget}>
        <div
          className={a.budgetBar}
          role="img"
          aria-label={`${percent(used, { digits: 0 })} of today's AI budget used`}
        >
          <span style={{ width: `${Math.max(1, used * 100)}%` }} />
        </div>
        <p className={s.muted}>
          {compact(ai.usedTokens)} of {compact(ai.dailyTokenBudget)} tokens used. It resets at midnight UTC.
        </p>
      </div>
    </Card>
  )
}

function Body({ data, days }) {
  const go = useNav((state) => state.go)
  const { kpis, series, risk, queue, corridors } = data
  const labels = series.days.map(dayLabel)
  const empty = kpis.payments.value === 0 && kpis.gross.previous === 0 && risk.scored === 0

  if (empty) {
    return (
      <EmptyState icon={Info} title="No payments yet">
        Payments from every seller show up here as they happen.
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
        <StatCard label="Paid sales" value={formatNumber(kpis.payments.value)} delta={deltaOf(kpis.payments)} tone={2}>
          <p className={s.note}>{formatNumber(kpis.sellers.value)} sellers made a sale</p>
        </StatCard>
        <StatCard
          label="Payments that succeed"
          value={percent(kpis.successRate.value)}
          delta={pointsOf(kpis.successRate)}
          tone={1}
        >
          <p className={s.note}>Of the payments that finished</p>
        </StatCard>
        <StatCard
          label="Blocked payments"
          value={formatNumber(kpis.blocked.value)}
          delta={deltaOf(kpis.blocked)}
          goodWhen="down"
          tone={2}
        >
          <p className={s.note}>
            {data.blockedUsdCents > 0 ? `${usd(data.blockedUsdCents)} kept out` : 'Nothing blocked'}
          </p>
        </StatCard>
      </div>

      <div className={s.split}>
        <div className={s.stack}>
          <Card title="Volume" action={<Legend items={[{ label: 'All sellers', color: 'var(--series-1)' }]} />}>
            <LineChart
              labels={labels}
              caption={`Volume by day, last ${days} days`}
              format={dollars}
              series={[
                { label: 'All sellers', values: series.gross.map(toDollars), color: 'var(--series-1)', area: true },
              ]}
            />
          </Card>

          <Card
            title="Latest flags"
            action={
              <Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => go('admin', 'transactions')}>
                All transactions
              </Button>
            }
            flush
          >
            <Table
              caption="Latest payments the rules acted on"
              rows={data.flagged}
              onRowClick={() => go('admin', 'transactions')}
              empty="Nothing has been held or blocked yet."
              columns={[
                {
                  key: 'reference',
                  label: 'Payment',
                  render: (row) => <span className={s.mono}>{row.reference}</span>,
                },
                { key: 'merchant', label: 'Seller', render: (row) => row.merchant.name },
                { key: 'risk', label: 'Risk', render: (row) => <RiskBadge risk={row.risk} /> },
                { key: 'status', label: 'Status', render: (row) => statusLabel(row.status) },
                { key: 'amount', label: 'Amount', align: 'right', render: (row) => usd(row.amountUsdCents) },
              ]}
            />
          </Card>
        </div>

        <div className={s.stack}>
          <Card title="Review queue">
            <div className={s.balance}>
              <strong className={s.balanceValue}>{formatNumber(queue.waiting)}</strong>
              <span className={s.muted}>
                {queue.waiting === 0
                  ? 'Nothing is waiting for a person.'
                  : `${usd(queue.amountUsdCents)} waiting. The oldest started ${timeAgo(queue.oldestAt)}.`}
              </span>
              <Button variant="primary" iconRight={ArrowRight} onClick={() => go('admin', 'review')}>
                Open the queue
              </Button>
            </div>
          </Card>

          <Card title="How payments were rated">
            {risk.scored === 0 ? (
              <p className={s.muted}>No payments were scored in this period.</p>
            ) : (
              <DonutChart
                caption="Payments by risk rating"
                format={(value) => formatNumber(value)}
                center={{ value: formatNumber(risk.scored), label: 'Scored' }}
                data={[
                  { label: 'Low', value: risk.low, color: 'var(--success)' },
                  { label: 'Medium, reviewed', value: risk.medium, color: 'var(--warning)' },
                  { label: 'High, blocked', value: risk.high, color: 'var(--danger)' },
                ].filter((part) => part.value > 0)}
              />
            )}
          </Card>

          <Card
            title="Corridors"
            action={
              <Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => go('admin', 'corridors')}>
                Manage
              </Button>
            }
          >
            <div className={s.cell}>
              <Badge tone="success" dot>
                {corridors.operational} working
              </Badge>
              {corridors.degraded > 0 && (
                <Badge tone="warning" dot>
                  {corridors.degraded} slow
                </Badge>
              )}
              {corridors.down > 0 && (
                <Badge tone="danger" dot>
                  {corridors.down} down
                </Badge>
              )}
            </div>
            {corridors.troubled.length > 0 && (
              <ul className={a.list}>
                {corridors.troubled.map((corridor) => (
                  <li key={`${corridor.countryCode}:${corridor.methodId}`} className={a.item}>
                    <span className={a.itemTitle}>
                      {corridor.methodLabel} in {corridor.countryName}
                    </span>
                    <span className={a.quiet}>{corridor.status === 'down' ? 'Down' : 'Slow'}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <AiCard ai={data.ai} />
        </div>
      </div>
    </>
  )
}

export default function Overview() {
  const [days, setDays] = useState(30)
  const state = useSellerData(() => getOverview({ days }), String(days), { watch: WATCH })

  return (
    <div className={p.page}>
      <PageHeader
        title="Overview"
        subtitle="The whole network, live."
        actions={<RangeSwitch value={days} onChange={setDays} />}
      />
      <DataState state={state} onRetry={state.reload} skeleton={<Skeletons />}>
        {state.data && <Body data={state.data} days={days} />}
      </DataState>
    </div>
  )
}
