/* Every payment, in every country: filter by status, method, country and period, search, sort, open one, export to CSV. */
import { useMemo, useState } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { getCountries, getPayments } from '@/api/seller.js'
import { useSellerData } from '@/hooks/useSellerData.js'
import { statusLabel } from '@/lib/status.js'
import { Button } from '@/ui/Button.jsx'
import { Select } from '@/ui/Field.jsx'
import LazyDataGrid from '@/ui/LazyDataGrid.jsx'
import PageHeader from '@/ui/PageHeader.jsx'
import { EmptyState, Skeleton } from '@/ui/States.jsx'
import { CountryCell, MethodCell, MoneyCell, StatusCell } from '@/ui/grid/cells.jsx'
import p from '../Page.module.css'
import PaymentDetail from './PaymentDetail.jsx'
import { dateTime } from './format.js'
import { DataState } from './parts.jsx'
import s from './Seller.module.css'

const DAY = 86_400_000

const STATUSES = [
  { value: '', label: 'All statuses' },
  { value: 'succeeded', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: 'in_review', label: 'In review' },
  { value: 'processing', label: 'Processing' },
  { value: 'refunded', label: 'Refunded' },
]

const METHODS = [
  { value: '', label: 'All methods' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'ussd', label: 'USSD' },
  { value: 'voucher', label: 'Cash voucher' },
  { value: 'card', label: 'Card' },
  { value: 'paypal', label: 'PayPal' },
]

const PERIODS = [
  { value: '', label: 'All time' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

const NONE = { status: '', method: '', country: '', period: '' }

/* The day a period starts, as the API takes it: 2026-11-04. */
const startOfPeriod = (days) =>
  days ? new Date(Date.now() - Number(days) * DAY).toISOString().slice(0, 10) : undefined

const cents = ({ value }) => (value == null ? '' : (value / 100).toFixed(2))

/* The columns a seller reads first come first: who, how it ended, how much. The rest follow. */
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
  { field: 'customer', headerName: 'Customer', width: 170 },
  {
    field: 'status',
    headerName: 'Status',
    width: 140,
    cellRenderer: StatusCell,
    valueFormatter: ({ value }) => statusLabel(value),
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
  {
    field: 'net',
    headerName: 'You receive',
    width: 130,
    type: 'rightAligned',
    filter: 'agNumberColumnFilter',
    cellRenderer: MoneyCell,
    valueFormatter: cents,
  },
  { field: 'method', headerName: 'Method', width: 210, cellRenderer: MethodCell },
  { field: 'country', headerName: 'Country', width: 180, cellRenderer: CountryCell },
  { field: 'email', headerName: 'Email', flex: 1, minWidth: 220 },
  { field: 'link', headerName: 'Payment link', width: 170 },
]

const toRow = (payment) => ({
  id: payment.id,
  reference: payment.reference,
  createdAt: new Date(payment.createdAt),
  customer: payment.buyer.name,
  email: payment.buyer.email,
  country: payment.country.name,
  countryCode: payment.country.code,
  method: payment.method.label,
  simulated: payment.simulated,
  amount: payment.amountUsdCents,
  net: payment.netUsdCents,
  status: payment.status,
  link: payment.link?.title ?? '',
})

export default function Payments() {
  const [filters, setFilters] = useState(NONE)
  const [open, setOpen] = useState(null)
  const set = (name) => (event) => setFilters((now) => ({ ...now, [name]: event.target.value }))

  const query = useMemo(
    () => ({
      status: filters.status,
      method: filters.method,
      country: filters.country,
      from: startOfPeriod(filters.period),
      limit: 1000,
    }),
    [filters],
  )
  const state = useSellerData(() => getPayments(query), JSON.stringify(query))
  const countries = useSellerData(() => getCountries({ days: 30 }), 'countries', { watch: [] })

  const rows = useMemo(() => state.data?.payments.map(toRow) ?? [], [state.data])
  const countryOptions = [
    { value: '', label: 'All countries' },
    ...(countries.data?.countries ?? []).map((country) => ({ value: country.code, label: country.name })),
  ]
  const filtered = Object.values(filters).some(Boolean)
  const total = state.data?.total ?? 0

  return (
    <div className={p.page}>
      <PageHeader title="Payments" subtitle="Every payment, in every country." />

      <div className={s.filters}>
        <Select
          label="Status"
          className={s.filterSelect}
          value={filters.status}
          onChange={set('status')}
          options={STATUSES}
        />
        <Select
          label="Method"
          className={s.filterSelect}
          value={filters.method}
          onChange={set('method')}
          options={METHODS}
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
              exportName="payments"
              searchPlaceholder="Search payments"
              noun="payments"
              height={620}
              pageSize={12}
            />
          </>
        )}
      </DataState>

      {open && <PaymentDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
