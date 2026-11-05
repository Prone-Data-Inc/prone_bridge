/* Fairness: proof that a buyer's country never decides risk. Four things, none of them a promise on its own:
     what the rules read   (listed from the code that scores, so the list cannot drift from it)
     what they never read  (and what the AI that words the notes never sees)
     a test you can run    (one real payment, scored again as if it came from every country)
     the outcomes          (how each country's payments were rated, with the real gap between them) */
import { useState } from 'react'
import { Scales } from '@phosphor-icons/react'
import { getFairness, probeFairness } from '@/api/admin.js'
import { useSellerData } from '@/hooks/useSellerData.js'
import { formatNumber, percent } from '@/lib/format.js'
import { toast } from '@/stores/toasts.js'
import Badge from '@/ui/Badge.jsx'
import { Button } from '@/ui/Button.jsx'
import { Card } from '@/ui/Card.jsx'
import PageHeader from '@/ui/PageHeader.jsx'
import { Skeleton } from '@/ui/States.jsx'
import Table from '@/ui/Table.jsx'
import p from '../Page.module.css'
import { DataState, RangeSwitch } from '../seller/parts.jsx'
import s from '../seller/Seller.module.css'
import a from './Admin.module.css'
import { SignalList } from './parts.jsx'
import { riskLabel, riskTone } from './risk.js'

const WATCH = ['payments', 'risk_assessments']

function Probe() {
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)

  async function run() {
    setRunning(true)
    try {
      setResult(await probeFairness())
    } catch (error) {
      toast(error.message, { tone: 'danger' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card
      title="Try it"
      action={
        <Button variant="primary" icon={Scales} loading={running} onClick={run}>
          {result ? 'Run it again' : 'Score it from every country'}
        </Button>
      }
    >
      <div className={a.list}>
        <p>
          Takes a real payment and scores it again as if it came from each country in turn, through the same code that
          scores every payment.
        </p>
        {result && !result.payment && <p className={s.muted}>There is no scored payment to try yet.</p>}
        {result?.payment && (
          <>
            <p className={a.quiet}>
              Payment <span className={s.mono}>{result.payment.reference}</span>, really from{' '}
              {result.payment.country.name}.
            </p>
            <div className={a.probeGrid}>
              {result.results.map((entry) => (
                <div key={entry.code} className={a.probeCell}>
                  <span>{entry.name}</span>
                  <Badge tone={riskTone(entry.level)} dot>
                    {entry.score}
                  </Badge>
                </div>
              ))}
            </div>
            <p className={a.verdict} role="status">
              {result.identical
                ? `The score is ${result.results[0].score} (${riskLabel(result.results[0].level).toLowerCase()}) in all ${result.results.length} countries.`
                : 'The scores differ between countries. This should never happen: report it.'}
            </p>
            <SignalList signals={result.fired} />
          </>
        )}
      </div>
    </Card>
  )
}

function Rate({ value, max }) {
  return (
    <span className={a.rate}>
      <span className={a.rateBar} aria-hidden>
        <span style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </span>
      <span className={a.rateValue}>{percent(value, { digits: 1 })}</span>
    </span>
  )
}

function Body({ data }) {
  const maxRate = Math.max(0, ...data.countries.map((country) => country.flaggedRate))
  const { gap, summary } = data

  return (
    <div className={a.fair}>
      <section className={a.hero}>
        <h2 className={a.heroTitle}>Country never decides risk</h2>
        <p>
          A payment is scored on what the buyer did: a throwaway email, repeated declines, many attempts in minutes.
          Where the buyer is from, their name and their language are not inputs. The rules refuse them: if code ever
          passed one, scoring would stop with an error, and a test fails the build.
        </p>
        <p className={s.note}>
          Engine {data.engine}. Under {data.thresholds.medium} is low and goes ahead. {data.thresholds.medium} to{' '}
          {data.thresholds.high - 1} is held for a person. {data.thresholds.high} and above is blocked.
        </p>
      </section>

      <div className={a.pillars}>
        <Card title="What the rules read">
          <ul className={a.list}>
            {data.inputs.map((input) => (
              <li key={input.id} className={a.item}>
                <span className={a.itemTitle}>{input.label}</span>
                <span className={a.quiet}>{input.note}</span>
              </li>
            ))}
          </ul>
        </Card>

        <div className={s.stack}>
          <Card title="What they never read">
            <div className={a.chips}>
              {data.neverUsed.map((name) => (
                <span key={name} className={`${a.chip} ${a.chipNever}`}>
                  {name}
                </span>
              ))}
            </div>
          </Card>
          <Card title="What the AI note sees">
            <div className={a.list}>
              <p className={a.quiet}>The AI only words the note. It never changes a decision.</p>
              <div>
                <p className={a.itemTitle}>Sees</p>
                <ul>
                  {data.explainer.sees.map((line) => (
                    <li key={line} className={a.quiet}>
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className={a.itemTitle}>Never sees</p>
                <div className={a.chips}>
                  {data.explainer.neverSees.map((name) => (
                    <span key={name} className={`${a.chip} ${a.chipNever}`}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card title="The rules" flush>
        <Table
          caption="The risk rules"
          rows={data.rules}
          columns={[
            { key: 'label', label: 'Rule' },
            { key: 'description', label: 'What it looks for' },
            { key: 'inputs', label: 'Reads', render: (row) => row.inputs.join(', ') },
            { key: 'max', label: 'Points', align: 'right', render: (row) => `up to ${row.max}` },
          ]}
        />
      </Card>

      <Probe />

      <Card title="How each country's payments were rated" flush>
        {data.countries.length === 0 ? (
          <p className={`${s.muted} ${a.padded}`}>No payments were scored in this period.</p>
        ) : (
          <Table
            caption="Ratings by country"
            rows={data.countries}
            columns={[
              { key: 'name', label: 'Country' },
              { key: 'assessed', label: 'Scored', align: 'right', render: (row) => formatNumber(row.assessed) },
              {
                key: 'averageScore',
                label: 'Average score',
                align: 'right',
                render: (row) => row.averageScore.toFixed(1),
              },
              { key: 'medium', label: 'Held', align: 'right', render: (row) => formatNumber(row.medium) },
              { key: 'high', label: 'Blocked', align: 'right', render: (row) => formatNumber(row.high) },
              { key: 'flaggedRate', label: 'Flagged', render: (row) => <Rate value={row.flaggedRate} max={maxRate} /> },
            ]}
          />
        )}
      </Card>
      <p className={s.note}>
        {summary.assessed === 0
          ? 'Nothing to compare yet.'
          : gap
            ? `Of ${formatNumber(summary.assessed)} scored payments, ${percent(summary.flaggedRate)} were held or blocked. Among countries with at least 30 payments, the highest rate is ${percent(gap.highest.flaggedRate)} (${gap.highest.name}) and the lowest ${percent(gap.lowest.flaggedRate)} (${gap.lowest.name}). Any gap comes from what buyers did, since country is not an input.`
            : `Of ${formatNumber(summary.assessed)} scored payments, ${percent(summary.flaggedRate)} were held or blocked. No two countries have enough payments to compare yet.`}
      </p>
    </div>
  )
}

export default function Fairness() {
  const [days, setDays] = useState(30)
  const state = useSellerData(() => getFairness({ days }), String(days), { watch: WATCH })

  return (
    <div className={p.page}>
      <PageHeader
        title="Fairness"
        subtitle="Proof that country never decides risk."
        actions={<RangeSwitch value={days} onChange={setDays} />}
      />
      <DataState
        state={state}
        onRetry={state.reload}
        skeleton={
          <>
            <Skeleton height={160} radius={16} />
            <Skeleton height={320} radius={16} />
          </>
        }
      >
        {state.data && <Body data={state.data} />}
      </DataState>
    </div>
  )
}
