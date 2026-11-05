/* The sellers on ProneBridge: what each one sold, how reliably their payments go through, and what they are owed. */
import { useState } from 'react'
import { Buildings } from '@phosphor-icons/react'
import { getMerchants } from '@/api/admin.js'
import { useSellerData } from '@/hooks/useSellerData.js'
import { formatNumber, percent } from '@/lib/format.js'
import Badge from '@/ui/Badge.jsx'
import { Card, StatCard } from '@/ui/Card.jsx'
import PageHeader from '@/ui/PageHeader.jsx'
import { EmptyState, Skeleton } from '@/ui/States.jsx'
import Table from '@/ui/Table.jsx'
import p from '../Page.module.css'
import { shortDate, usd } from '../seller/format.js'
import { DataState, RangeSwitch } from '../seller/parts.jsx'
import s from '../seller/Seller.module.css'

const WATCH = ['payments', 'payouts']

export default function Merchants() {
  const [days, setDays] = useState(30)
  const state = useSellerData(() => getMerchants({ days }), String(days), { watch: WATCH })
  const sellers = state.data?.merchants ?? []

  const volume = sellers.reduce((sum, seller) => sum + seller.grossUsdCents, 0)
  const sales = sellers.reduce((sum, seller) => sum + seller.paid, 0)
  const owed = sellers.reduce((sum, seller) => sum + seller.owedUsdCents, 0)

  return (
    <div className={p.page}>
      <PageHeader
        title="Merchants"
        subtitle="Sellers on the platform."
        actions={<RangeSwitch value={days} onChange={setDays} />}
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
        {state.data && (
          <>
            <div className={s.stats}>
              <StatCard label="Sellers" value={formatNumber(sellers.length)} tone={1}>
                <p className={s.note}>{sellers.filter((seller) => seller.status === 'active').length} active</p>
              </StatCard>
              <StatCard label="Volume" value={usd(volume)} tone={2}>
                <p className={s.note}>{formatNumber(sales)} paid sales</p>
              </StatCard>
              <StatCard label="Owed to sellers" value={usd(owed)} tone={1}>
                <p className={s.note}>Waiting for a payout</p>
              </StatCard>
            </div>

            <Card title="All sellers" flush>
              {sellers.length === 0 ? (
                <EmptyState icon={Buildings} title="No sellers yet">
                  Sellers show up here when they join.
                </EmptyState>
              ) : (
                <Table
                  caption="Sellers"
                  rows={sellers}
                  columns={[
                    {
                      key: 'name',
                      label: 'Seller',
                      render: (row) => (
                        <span className={s.cellText}>
                          <span className={s.name}>{row.name}</span>
                          <span className={s.cellSub}>Joined {shortDate(row.joinedAt)}</span>
                        </span>
                      ),
                    },
                    {
                      key: 'status',
                      label: 'Status',
                      render: (row) => (
                        <Badge tone={row.status === 'active' ? 'success' : 'neutral'} dot>
                          {row.status === 'active' ? 'Active' : 'Paused'}
                        </Badge>
                      ),
                    },
                    { key: 'products', label: 'Courses', align: 'right' },
                    { key: 'methodsOn', label: 'Methods on', align: 'right' },
                    { key: 'paid', label: 'Paid sales', align: 'right', render: (row) => formatNumber(row.paid) },
                    { key: 'gross', label: 'Volume', align: 'right', render: (row) => usd(row.grossUsdCents) },
                    {
                      key: 'rate',
                      label: 'Succeed',
                      align: 'right',
                      render: (row) => percent(row.successRate, { digits: 0 }),
                    },
                    { key: 'blocked', label: 'Blocked', align: 'right' },
                    { key: 'inReview', label: 'In review', align: 'right' },
                    { key: 'owed', label: 'Owed', align: 'right', render: (row) => usd(row.owedUsdCents) },
                  ]}
                />
              )}
            </Card>
          </>
        )}
      </DataState>
    </div>
  )
}
