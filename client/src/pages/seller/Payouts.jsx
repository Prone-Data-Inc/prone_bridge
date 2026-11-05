/* Money on its way to the seller. What is waiting, what is on its way, what has been paid, and a button to pay out now. */
import { useState } from 'react'
import { ArrowsClockwise, Bank } from '@phosphor-icons/react'
import { getPayout, getPayouts, refreshPayout, runPayout } from '@/api/seller.js'
import { useSellerData } from '@/hooks/useSellerData.js'
import { formatNumber } from '@/lib/format.js'
import { toast } from '@/stores/toasts.js'
import Badge from '@/ui/Badge.jsx'
import { Button } from '@/ui/Button.jsx'
import { Card, StatCard } from '@/ui/Card.jsx'
import Modal from '@/ui/Modal.jsx'
import PageHeader from '@/ui/PageHeader.jsx'
import { EmptyState, Skeleton } from '@/ui/States.jsx'
import Table from '@/ui/Table.jsx'
import p from '../Page.module.css'
import { dateTime, shortDate, usd } from './format.js'
import { DataState } from './parts.jsx'
import s from './Seller.module.css'

const WATCH = ['payouts', 'payments']

const PAYOUT_STATUS = {
  scheduled: { label: 'Scheduled', tone: 'neutral' },
  processing: { label: 'On its way', tone: 'accent' },
  paid: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
}

const statusOf = (status) => PAYOUT_STATUS[status] ?? { label: status, tone: 'neutral' }

/* "Oct 6 to Oct 12", or one day. */
function period(payout) {
  if (!payout.periodStart) return 'Not set'
  const from = shortDate(`${payout.periodStart}T00:00:00Z`)
  const to = shortDate(`${payout.periodEnd}T00:00:00Z`)
  return from === to ? from : `${from} to ${to}`
}

const kind = (payout) => (payout.simulated ? 'Simulated' : 'PayPal sandbox')

function Detail({ id, onClose, onChanged }) {
  const state = useSellerData(() => getPayout(id), id, { watch: WATCH })
  const [checking, setChecking] = useState(false)
  const payout = state.data?.payout

  async function check() {
    setChecking(true)
    try {
      await refreshPayout(id)
      await state.reload({ quiet: true })
      onChanged()
    } catch (error) {
      toast(error.message, { tone: 'danger' })
    } finally {
      setChecking(false)
    }
  }

  const open = payout && !payout.simulated && ['scheduled', 'processing'].includes(payout.status)

  return (
    <Modal
      open
      size="lg"
      title={payout ? `Payout ${payout.reference}` : 'Payout'}
      onClose={onClose}
      footer={
        <>
          {open && (
            <Button icon={ArrowsClockwise} loading={checking} onClick={check}>
              Check with PayPal
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <DataState state={state} onRetry={state.reload} skeleton={<Skeleton height={240} radius={12} />}>
        {payout && (
          <div className={s.detail}>
            <div className={s.cell}>
              <Badge tone={statusOf(payout.status).tone} dot>
                {statusOf(payout.status).label}
              </Badge>
              <span className={s.tag}>{kind(payout)}</span>
              {payout.failureCode && (
                <span className={s.muted}>{payout.failureCode.replaceAll('_', ' ').toLowerCase()}</span>
              )}
            </div>
            <dl className={s.detailGrid}>
              <div>
                <dt>Amount</dt>
                <dd>{usd(payout.amountUsdCents)}</dd>
              </div>
              <div>
                <dt>Sales covered</dt>
                <dd>{payout.paymentsCount}</dd>
              </div>
              <div>
                <dt>Period</dt>
                <dd>{period(payout)}</dd>
              </div>
              <div>
                <dt>Sent to</dt>
                <dd>{payout.recipientEmail ?? 'Not set'}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{dateTime(payout.createdAt)}</dd>
              </div>
              {payout.paidAt && (
                <div>
                  <dt>Paid</dt>
                  <dd>{dateTime(payout.paidAt)}</dd>
                </div>
              )}
            </dl>
            <section aria-labelledby="payout-sales">
              <h3 id="payout-sales" className={s.heading}>
                Sales in this payout
              </h3>
              <Table
                caption="Sales in this payout"
                rows={state.data.payments}
                empty="No sales are attached to this payout."
                columns={[
                  {
                    key: 'reference',
                    label: 'Payment',
                    render: (row) => <span className={s.mono}>{row.reference}</span>,
                  },
                  { key: 'buyerName', label: 'Customer' },
                  { key: 'amount', label: 'Price', align: 'right', render: (row) => usd(row.amountUsdCents) },
                  { key: 'fee', label: 'Fee', align: 'right', render: (row) => usd(row.feeUsdCents) },
                  { key: 'net', label: 'You receive', align: 'right', render: (row) => usd(row.netUsdCents) },
                ]}
              />
            </section>
          </div>
        )}
      </DataState>
    </Modal>
  )
}

export default function Payouts() {
  const [open, setOpen] = useState(null)
  const [running, setRunning] = useState(false)
  const state = useSellerData(() => getPayouts(), 'payouts', { watch: WATCH })

  async function payOut() {
    setRunning(true)
    try {
      const { payouts } = await runPayout()
      const total = payouts.reduce((sum, payout) => sum + payout.amountUsdCents, 0)
      toast(
        payouts.length === 0 ? 'Nothing to pay out yet.' : `${usd(total)} is on its way to you.`,
        payouts.length === 0 ? {} : { tone: 'success' },
      )
      await state.reload({ quiet: true })
    } catch (error) {
      toast(error.message, { tone: 'danger' })
    } finally {
      setRunning(false)
    }
  }

  const data = state.data
  const owed = data?.balance.owedUsdCents ?? 0

  return (
    <div className={p.page}>
      <PageHeader
        title="Payouts"
        subtitle="Money on its way to you."
        actions={
          <Button variant="primary" icon={Bank} loading={running} disabled={!data || owed === 0} onClick={payOut}>
            Pay out now
          </Button>
        }
      />

      <DataState
        state={state}
        onRetry={state.reload}
        skeleton={
          <>
            <Skeleton height={120} radius={16} />
            <Skeleton height={320} radius={16} />
          </>
        }
      >
        {data && (
          <>
            <div className={s.stats}>
              <StatCard label="Waiting for a payout" value={usd(owed)} tone={1}>
                <p className={s.note}>
                  {data.balance.owedPayments === 0
                    ? 'Nothing is waiting.'
                    : `${formatNumber(data.balance.owedPayments)} paid sales, after fees`}
                </p>
              </StatCard>
              <StatCard label="On its way" value={usd(data.totals.onItsWayUsdCents)} tone={2}>
                <p className={s.note}>Sent, not yet received</p>
              </StatCard>
              <StatCard label="Paid out" value={usd(data.totals.paidUsdCents)} tone={1}>
                <p className={s.note}>{formatNumber(data.totals.paidCount)} payouts</p>
              </StatCard>
            </div>

            <p className={s.note}>
              {data.paypal.available && data.paypal.payoutAccountSet
                ? 'Sales paid with card or PayPal are paid out through PayPal Payouts, in the PayPal sandbox. Every other payout is simulated.'
                : 'Payouts are simulated in this demo. Nothing is sent to a bank or a wallet.'}
            </p>

            <Card title="All payouts" flush>
              {data.payouts.length === 0 ? (
                <EmptyState icon={Bank} title="No payouts yet">
                  When you pay out, it shows up here.
                </EmptyState>
              ) : (
                <Table
                  caption="Payouts"
                  rows={data.payouts}
                  onRowClick={(row) => setOpen(row.id)}
                  columns={[
                    {
                      key: 'reference',
                      label: 'Payout',
                      render: (row) => <span className={s.mono}>{row.reference}</span>,
                    },
                    { key: 'createdAt', label: 'Started', render: (row) => shortDate(row.createdAt) },
                    { key: 'period', label: 'Sales from', render: period },
                    { key: 'paymentsCount', label: 'Sales', align: 'right' },
                    { key: 'amount', label: 'Amount', align: 'right', render: (row) => usd(row.amountUsdCents) },
                    { key: 'kind', label: 'Type', render: (row) => <span className={s.tag}>{kind(row)}</span> },
                    {
                      key: 'status',
                      label: 'Status',
                      render: (row) => (
                        <Badge tone={statusOf(row.status).tone} dot>
                          {statusOf(row.status).label}
                        </Badge>
                      ),
                    },
                  ]}
                />
              )}
            </Card>
          </>
        )}
      </DataState>

      {open && <Detail id={open} onClose={() => setOpen(null)} onChanged={() => state.reload({ quiet: true })} />}
    </div>
  )
}
