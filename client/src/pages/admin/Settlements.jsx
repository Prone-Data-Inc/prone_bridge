/* Settlements: money going from ProneBridge to sellers. What is owed to each seller, what is on its way and what has been
   paid. Payouts of local methods and of the demo history are simulated. Genuine PayPal sandbox sales go through PayPal. */
import { useState } from 'react'
import { Bank } from '@phosphor-icons/react'
import { getSettlements, runSettlement } from '@/api/admin.js'
import { useSellerData } from '@/hooks/useSellerData.js'
import { formatNumber } from '@/lib/format.js'
import { toast } from '@/stores/toasts.js'
import Badge from '@/ui/Badge.jsx'
import { Button } from '@/ui/Button.jsx'
import { Card, StatCard } from '@/ui/Card.jsx'
import PageHeader from '@/ui/PageHeader.jsx'
import { EmptyState, Skeleton } from '@/ui/States.jsx'
import Table from '@/ui/Table.jsx'
import p from '../Page.module.css'
import { dateTime, usd } from '../seller/format.js'
import { DataState } from '../seller/parts.jsx'
import s from '../seller/Seller.module.css'

const WATCH = ['payouts', 'payments']

const PAYOUT_STATUS = {
  scheduled: { label: 'Scheduled', tone: 'neutral' },
  processing: { label: 'On its way', tone: 'accent' },
  paid: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
}
const statusOf = (status) => PAYOUT_STATUS[status] ?? { label: status, tone: 'neutral' }

export default function Settlements() {
  const state = useSellerData(() => getSettlements(), 'settlements', { watch: WATCH })
  const [running, setRunning] = useState(null)

  async function payOut(seller) {
    setRunning(seller.slug)
    try {
      const { payouts } = await runSettlement(seller.slug)
      const total = payouts.reduce((sum, payout) => sum + payout.amountUsdCents, 0)
      toast(
        payouts.length === 0 ? `Nothing to pay out for ${seller.name}.` : `${usd(total)} paid out to ${seller.name}.`,
        payouts.length === 0 ? {} : { tone: 'success' },
      )
      await state.reload({ quiet: true })
    } catch (error) {
      toast(error.message, { tone: 'danger' })
    } finally {
      setRunning(null)
    }
  }

  const data = state.data

  return (
    <div className={p.page}>
      <PageHeader title="Settlements" subtitle="Payouts through PayPal." />

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
              <StatCard label="Owed to sellers" value={usd(data.totals.owedUsdCents)} tone={1}>
                <p className={s.note}>{formatNumber(data.totals.owedPayments)} paid sales, after fees</p>
              </StatCard>
              <StatCard label="On its way" value={usd(data.totals.onItsWayUsdCents)} tone={2}>
                <p className={s.note}>Sent, not yet received</p>
              </StatCard>
              <StatCard label="Paid out" value={usd(data.totals.paidUsdCents)} tone={1}>
                <p className={s.note}>
                  {data.totals.viaPaypal} through PayPal
                  {data.totals.failed > 0 ? `, ${data.totals.failed} failed` : ''}
                </p>
              </StatCard>
            </div>

            <p className={s.note}>
              Payouts of local methods and of the demo history are simulated. Nothing is sent to a bank or a wallet.
              Genuine PayPal sandbox sales are paid through PayPal Payouts when a payout account is set.
            </p>

            <Card title="Waiting for a payout" flush>
              {data.owed.length === 0 ? (
                <EmptyState icon={Bank} title="Every seller is paid up">
                  What sellers are owed shows up here after their next sale.
                </EmptyState>
              ) : (
                <Table
                  caption="Owed by seller"
                  rows={data.owed}
                  columns={[
                    { key: 'name', label: 'Seller' },
                    { key: 'owed', label: 'Owed', align: 'right', render: (row) => usd(row.owedUsdCents) },
                    {
                      key: 'action',
                      label: '',
                      align: 'right',
                      render: (row) => (
                        <Button
                          size="sm"
                          icon={Bank}
                          loading={running === row.slug}
                          disabled={running !== null}
                          onClick={() => payOut(row)}
                        >
                          Pay out
                        </Button>
                      ),
                    },
                  ]}
                />
              )}
            </Card>

            <Card title="All payouts" flush>
              <Table
                caption="Payouts"
                rows={data.payouts}
                empty="No payouts yet."
                columns={[
                  {
                    key: 'reference',
                    label: 'Payout',
                    render: (row) => <span className={s.mono}>{row.reference}</span>,
                  },
                  { key: 'merchant', label: 'Seller', render: (row) => row.merchant.name },
                  { key: 'createdAt', label: 'Started', render: (row) => dateTime(row.createdAt) },
                  { key: 'paymentsCount', label: 'Sales', align: 'right' },
                  { key: 'amount', label: 'Amount', align: 'right', render: (row) => usd(row.amountUsdCents) },
                  {
                    key: 'kind',
                    label: 'Type',
                    render: (row) => <span className={s.tag}>{row.simulated ? 'Simulated' : 'PayPal sandbox'}</span>,
                  },
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
            </Card>
          </>
        )}
      </DataState>
    </div>
  )
}
