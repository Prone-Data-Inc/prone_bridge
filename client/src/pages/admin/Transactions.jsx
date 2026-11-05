/* Every payment on ProneBridge, from every seller: filter by status, seller, method, country, risk and period, search,
   sort, open one, export to CSV. */
import { useMemo, useState } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { getMerchants, getTransactions } from '@/api/admin.js'
import { useSellerData } from '@/hooks/useSellerData.js'
import { statusLabel } from '@/lib/status.js'
import { Button } from '@/ui/Button.jsx'
import { Select } from '@/ui/Field.jsx'
import LazyDataGrid from '@/ui/LazyDataGrid.jsx'
import PageHeader from '@/ui/PageHeader.jsx'
import { EmptyState, Skeleton } from '@/ui/States.jsx'
import { CountryCell, MethodCell, MoneyCell, StatusCell } from '@/ui/grid/cells.jsx'
import p from '../Page.module.css'
import { dateTime } from '../seller/format.js'
import { DataState } from '../seller/parts.jsx'
import s from '../seller/Seller.module.css'
import TransactionDetail from './TransactionDetail.jsx'
import { RiskCell } from './parts.jsx'
import { LEVEL_OPTIONS, METHOD_OPTIONS, STATUS_OPTIONS, riskLabel } from './risk.js'

/* A payment's rating arrives a moment after the payment, so a new rating reloads the table too. */
const WATCH = ['payments', 'payouts', 'risk_assessments']

const DAY = 86_400_000

const PERIODS = [
  { value: '', label: 'All time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

const NONE = { status: '', merchant: '', method: '', country: '', level: '', period: '' }

/* The day a period starts, as the API takes it: 2026-11-04. */
const startOfPeriod = (days) =>
  days ? new Date(Date.now() - Number(days) * DAY).toISOString().slice(0, 10) : undefined

const cents = ({ value }) => (value == null ? '' : (value / 100).toFixed(2))

const COLUMNS = [
  { field: 'reference', headerName: 'Payment', pinned: 'left', width: 160 },
  {
    field: 'createdAt',
    headerName: 'Date',
    width: 160,
    sort: 'desc',
    filter: false,
    valueFormatter: ({ value }) => dateTime(value),
  },
  { field: 'seller', headerName: 'Seller', width: 190 },
  {
    field: 'status',
    headerName: 'Status',
    width: 140,
    cellRenderer: StatusCell,
    valueFormatter: ({ value }) => statusLabel(value),
  },
  {
    field: 'level',
    headerName: 'Risk',
    width: 130,
    cellRenderer: RiskCell,
    valueFormatter: ({ value }) => (value ? riskLabel(value) : 'Not scored'),
  },
  {
    field: 'score',
    headerName: 'Score',
    width: 100,
    type: 'rightAligned',
    filter: 'agNumberColumnFilter',
  },
  {
    field: 'amount',
    headerName: 'Price',
    width: 110,
    type: 'rightAligned',
    filter: 'agNumberColumnFilter',
    cellRenderer: MoneyCell,
    valueFormatter: cents,
  },
  { field: 'customer', headerName: 'Buyer', width: 170 },
  { field: 'method', headerName: 'Method', width: 210, cellRenderer: MethodCell },
  { field: 'country', headerName: 'Country', width: 180, cellRenderer: CountryCell },
  { field: 'email', headerName: 'Email', flex: 1, minWidth: 220 },
]

const toRow = (payment) => ({
  id: payment.id,
  reference: payment.reference,
  createdAt: new Date(payment.createdAt),
  seller: payment.merchant.name,
  customer: payment.buyer.name,
  email: payment.buyer.email,
  country: payment.country.name,
  countryCode: payment.country.code,
  method: payment.method.label,
  simulated: payment.simulated,
  amount: payment.amountUsdCents,
  status: payment.status,
  level: payment.risk?.level ?? '',
  score: payment.risk?.score ?? null,
})

export default function Transactions() {
  const [filters, setFilters] = useState(NONE)
  const [open, setOpen] = useState(null)
  const set = (name) => (event) => setFilters((now) => ({ ...now, [name]: event.target.value }))

  const query = useMemo(
    () => ({
      status: filters.status,
      merchant: filters.merchant,
      method: filters.method,
      country: filters.country,
      level: filters.level,
      from: startOfPeriod(filters.period),
      limit: 1000,
    }),
    [filters],
  )
  const state = useSellerData(() => getTransactions(query), JSON.stringify(query), { watch: WATCH })
  const sellers = useSellerData(() => getMerchants({ days: 30 }), 'sellers', { watch: [] })

  const rows = useMemo(() => state.data?.payments.map(toRow) ?? [], [state.data])
  const sellerOptions = [
    { value: '', label: 'All sellers' },
    ...(sellers.data?.merchants ?? []).map((seller) => ({ value: seller.slug, label: seller.name })),
  ]
  const countryOptions = useMemo(() => {
    const seen = new Map()
    for (const payment of state.data?.payments ?? []) seen.set(payment.country.code, payment.country.name)
    if (filters.country && !seen.has(filters.country)) seen.set(filters.country, filters.country)
    return [
      { value: '', label: 'All countries' },
      ...[...seen].map(([value, label]) => ({ value, label })).sort((x, y) => x.label.localeCompare(y.label)),
    ]
  }, [state.data, filters.country])

  const filtered = Object.values(filters).some(Boolean)
  const total = state.data?.total ?? 0

  return (
    <div className={p.page}>
      <PageHeader title="Transactions" subtitle="Every payment on ProneBridge." />

      <div className={s.filters}>
        <Select
          label="Status"
          className={s.filterSelect}
          value={filters.status}
          onChange={set('status')}
          options={STATUS_OPTIONS}
        />
        <Select
          label="Risk"
          className={s.filterSelect}
          value={filters.level}
          onChange={set('level')}
          options={LEVEL_OPTIONS}
        />
        <Select
          label="Seller"
          className={s.filterSelect}
          value={filters.merchant}
          onChange={set('merchant')}
          options={sellerOptions}
        />
        <Select
          label="Method"
          className={s.filterSelect}
          value={filters.method}
          onChange={set('method')}
          options={METHOD_OPTIONS}
        />
        <Select
          label="Country"
          className={s.filterSelect}
          value={filters.country}
          onChange={set('country')}
          options={countryOptions}
        />
        <Select
          label="Period"
          className={s.filterSelect}
          value={filters.period}
          onChange={set('period')}
          options={PERIODS}
        />
        {filtered && (
          <Button variant="ghost" onClick={() => setFilters(NONE)}>
            Clear filters
          </Button>
        )}
      </div>

      <DataState state={state} onRetry={state.reload} skeleton={<Skeleton height={600} radius={16} />}>
        {state.data && rows.length === 0 && (
          <EmptyState icon={MagnifyingGlass} title={filtered ? 'No payments match' : 'No payments yet'}>
            {filtered ? 'Try fewer filters or a longer period.' : 'Payments show up here as they happen.'}
          </EmptyState>
        )}
        {state.data && rows.length > 0 && (
          <>
            {total > rows.length && (
              <p className={s.note}>
                Showing the latest {rows.length.toLocaleString('en-US')} of {total.toLocaleString('en-US')} payments.
                Narrow the filters to see the rest.
              </p>
            )}
            <LazyDataGrid
              rows={rows}
              columns={COLUMNS}
              getRowId={(row) => row.id}
              onRowClick={(row) => setOpen(row.id)}
              exportName="transactions"
              searchPlaceholder="Search transactions"
              noun="payments"
              height={620}
              pageSize={12}
            />
          </>
        )}
      </DataState>

      {open && <TransactionDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
