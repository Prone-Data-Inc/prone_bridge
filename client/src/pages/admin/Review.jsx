/* The risk review queue: payments the rules held before any money moved. Each one shows what fired and a note in plain
   words. A person approves it (the buyer can finish paying) or rejects it (it is blocked). */
import { useState } from 'react'
import { CheckCircle, ShieldCheck } from '@phosphor-icons/react'
import { getReview } from '@/api/admin.js'
import { useSellerData } from '@/hooks/useSellerData.js'
import { timeAgo } from '@/lib/format.js'
import Badge from '@/ui/Badge.jsx'
import { Button } from '@/ui/Button.jsx'
import { Card } from '@/ui/Card.jsx'
import PageHeader from '@/ui/PageHeader.jsx'
import { EmptyState, Skeleton } from '@/ui/States.jsx'
import Table from '@/ui/Table.jsx'
import p from '../Page.module.css'
import { dateTime, usd } from '../seller/format.js'
import { DataState } from '../seller/parts.jsx'
import s from '../seller/Seller.module.css'
import a from './Admin.module.css'
import DecisionDialog from './DecisionDialog.jsx'
import TransactionDetail from './TransactionDetail.jsx'
import { Explanation, RiskBadge, ScoreMeter, SignalList } from './parts.jsx'

const WATCH = ['payments', 'risk_assessments']

function Held({ payment, onDecide, onOpen }) {
  const { assessment } = payment
  return (
    <article className={a.held} aria-label={`Payment ${payment.reference}`}>
      <div className={a.heldHead}>
        <div>
          <h2 className={a.heldTitle}>
            {usd(payment.amountUsdCents)} for {payment.product.title}
          </h2>
          <p className={a.quiet}>
            <span className={s.mono}>{payment.reference}</span>. Waiting since {timeAgo(payment.createdAt)}.
          </p>
        </div>
        <RiskBadge risk={payment.risk} />
      </div>

      <ScoreMeter score={payment.risk.score} level={payment.risk.level} />

      <dl className={a.heldMeta}>
        <div>
          <dt>Seller</dt>
          <dd>{payment.merchant.name}</dd>
        </div>
        <div>
          <dt>Buyer</dt>
          <dd>
            {payment.buyer.name}
            <span className={s.cellSub}>{payment.buyer.email}</span>
          </dd>
        </div>
        <div>
          <dt>Method</dt>
          <dd>{payment.method.label}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{dateTime(payment.createdAt)}</dd>
        </div>
      </dl>

      <SignalList signals={assessment.signals} />
      <Explanation text={assessment.explanation} source={assessment.explanationSource} />

      <div className={a.decide}>
        <Button variant="ghost" onClick={() => onOpen(payment.id)}>
          Details
        </Button>
        <Button variant="danger" onClick={() => onDecide(payment, 'reject')}>
          Reject
        </Button>
        <Button variant="primary" icon={CheckCircle} onClick={() => onDecide(payment, 'approve')}>
          Approve
        </Button>
      </div>
    </article>
  )
}

export default function Review() {
  const state = useSellerData(() => getReview(), 'review', { watch: WATCH })
  const [deciding, setDeciding] = useState(null)
  const [open, setOpen] = useState(null)
  const data = state.data

  return (
    <div className={p.page}>
      <PageHeader title="Risk review" subtitle="Payments the AI wants a person to check." />

      <DataState
        state={state}
        onRetry={state.reload}
        skeleton={
          <>
            <Skeleton height={320} radius={16} />
            <Skeleton height={200} radius={16} />
          </>
        }
      >
        {data && (
          <>
            <p className={s.note}>
              The rules hold a payment before any money moves when their score is 30 to 59. A score of 60 or more is
              blocked at once. The rules decide. The AI only writes the note, from what the rules found. It never sees
              the buyer's name, email or country.
            </p>

            {data.queue.length === 0 ? (
              <EmptyState icon={ShieldCheck} title="Nothing is waiting">
                Held payments show up here the moment the rules hold one.
              </EmptyState>
            ) : (
              <div className={a.queue}>
                {data.queue.map((payment) => (
                  <Held
                    key={payment.id}
                    payment={payment}
                    onDecide={(held, action) => setDeciding({ payment: held, action })}
                    onOpen={setOpen}
                  />
                ))}
              </div>
            )}

            <Card title="Recent decisions" flush>
              <Table
                caption="Recent decisions"
                rows={data.recent}
                onRowClick={(row) => setOpen(row.id)}
                empty="No payment has been reviewed yet."
                columns={[
                  {
                    key: 'reference',
                    label: 'Payment',
                    render: (row) => <span className={s.mono}>{row.reference}</span>,
                  },
                  { key: 'merchant', label: 'Seller', render: (row) => row.merchant.name },
                  { key: 'amount', label: 'Amount', align: 'right', render: (row) => usd(row.amountUsdCents) },
                  {
                    key: 'decision',
                    label: 'Decision',
                    render: (row) => (
                      <Badge tone={row.review.decision === 'approved' ? 'success' : 'danger'} dot>
                        {row.review.decision === 'approved' ? 'Approved' : 'Rejected'}
                      </Badge>
                    ),
                  },
                  { key: 'note', label: 'Note', render: (row) => row.review.note ?? '' },
                  { key: 'at', label: 'When', render: (row) => timeAgo(row.review.at) },
                ]}
              />
            </Card>
          </>
        )}
      </DataState>

      {deciding && (
        <DecisionDialog
          payment={deciding.payment}
          action={deciding.action}
          onClose={() => setDeciding(null)}
          onDone={() => state.reload({ quiet: true })}
        />
      )}
      {open && <TransactionDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
