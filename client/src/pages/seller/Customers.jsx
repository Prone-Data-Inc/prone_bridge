/* The people who buy from the seller: what each one spent, how often, where from, and what they own. */
import { useMemo, useState } from 'react'
import { Users } from '@phosphor-icons/react'
import { getCustomer, getCustomers } from '@/api/seller.js'
import { useSellerData } from '@/hooks/useSellerData.js'
import { statusLabel, statusTone } from '@/lib/status.js'
import Avatar from '@/ui/Avatar.jsx'
import Badge from '@/ui/Badge.jsx'
import { Button } from '@/ui/Button.jsx'
import LazyDataGrid from '@/ui/LazyDataGrid.jsx'
import Modal from '@/ui/Modal.jsx'
import PageHeader from '@/ui/PageHeader.jsx'
import { EmptyState, Skeleton } from '@/ui/States.jsx'
import Table from '@/ui/Table.jsx'
import { CountryCell, MoneyCell } from '@/ui/grid/cells.jsx'
import p from '../Page.module.css'
import { shortDate, usd } from './format.js'
import { DataState } from './parts.jsx'
import s from './Seller.module.css'

function NameCell({ value }) {
  return (
    <span className={s.cell}>
      <Avatar name={value} size={26} />
      <span className={s.name}>{value}</span>
    </span>
  )
}

const cents = ({ value }) => (value == null ? '' : (value / 100).toFixed(2))

const COLUMNS = [
  { field: 'name', headerName: 'Customer', flex: 1, minWidth: 200, cellRenderer: NameCell },
  { field: 'email', headerName: 'Email', flex: 1, minWidth: 220 },
  { field: 'country', headerName: 'Country', width: 190, cellRenderer: CountryCell },
  { field: 'orders', headerName: 'Orders', width: 110, type: 'rightAligned', filter: 'agNumberColumnFilter' },
  {
    field: 'spent',
    headerName: 'Spent',
    width: 130,
    type: 'rightAligned',
    sort: 'desc',
    filter: 'agNumberColumnFilter',
    cellRenderer: MoneyCell,
    valueFormatter: cents,
  },
  { field: 'courses', headerName: 'Courses', width: 110, type: 'rightAligned', filter: 'agNumberColumnFilter' },
  {
    field: 'lastAt',
    headerName: 'Last purchase',
    width: 160,
    filter: false,
    valueFormatter: ({ value }) => shortDate(value),
  },
]

const toRow = (customer) => ({
  id: customer.id,
  name: customer.name,
  email: customer.email,
  country: customer.country.name,
  countryCode: customer.country.code,
  orders: customer.orders,
  spent: customer.spentUsdCents,
  courses: customer.courses,
  lastAt: new Date(customer.lastAt),
})

function Detail({ id, onClose }) {
  const state = useSellerData(() => getCustomer(id), id)
  const customer = state.data?.customer

  return (
    <Modal
      open
      size="lg"
      title={customer?.name ?? 'Customer'}
      onClose={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <DataState
        state={state}
        onRetry={state.reload}
        skeleton={
          <div className={s.detail}>
            <Skeleton height={60} radius={12} />
            <Skeleton height={160} radius={12} />
          </div>
        }
      >
        {state.data && (
          <div className={s.detail}>
            <p className={s.muted}>
              {customer.email}. {customer.country.name}.
            </p>
            <dl className={s.facts}>
              <div className={s.fact}>
                <dt>Spent</dt>
                <dd>{usd(customer.spentUsdCents)}</dd>
              </div>
              <div className={s.fact}>
                <dt>Orders</dt>
                <dd>{customer.orders}</dd>
              </div>
              <div className={s.fact}>
                <dt>Courses unlocked</dt>
                <dd>{customer.courses}</dd>
              </div>
              <div className={s.fact}>
                <dt>Customer since</dt>
                <dd>{shortDate(customer.firstAt)}</dd>
              </div>
            </dl>

            <section aria-labelledby="customer-courses">
              <h3 id="customer-courses" className={s.heading}>
                Courses
              </h3>
              {state.data.courses.length === 0 ? (
                <p className={s.muted}>Nothing unlocked yet.</p>
              ) : (
                <ul className={s.stack}>
                  {state.data.courses.map((course) => (
                    <li key={course.id}>
                      <span className={s.name}>{course.title}</span>{' '}
                      <span className={s.muted}>since {shortDate(course.unlockedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="customer-payments">
              <h3 id="customer-payments" className={s.heading}>
                Payments
              </h3>
              <Table
                caption={`Payments by ${customer.name}`}
                rows={state.data.payments}
                columns={[
                  {
                    key: 'reference',
                    label: 'Payment',
                    render: (row) => <span className={s.mono}>{row.reference}</span>,
                  },
                  { key: 'product', label: 'Course', render: (row) => row.product.title },
                  { key: 'date', label: 'Date', render: (row) => shortDate(row.createdAt) },
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
            </section>
          </div>
        )}
      </DataState>
    </Modal>
  )
}

export default function Customers() {
  const [open, setOpen] = useState(null)
  const state = useSellerData(() => getCustomers({ limit: 1000 }), 'customers')
  const rows = useMemo(() => state.data?.customers.map(toRow) ?? [], [state.data])

  return (
    <div className={p.page}>
      <PageHeader title="Customers" subtitle="The people who buy from you." />
      <DataState state={state} onRetry={state.reload} skeleton={<Skeleton height={600} radius={16} />}>
        {state.data && rows.length === 0 && (
          <EmptyState icon={Users} title="No customers yet">
            People show up here after their first payment.
          </EmptyState>
        )}
        {state.data && rows.length > 0 && (
          <LazyDataGrid
            rows={rows}
            columns={COLUMNS}
            getRowId={(row) => row.id}
            onRowClick={(row) => setOpen(row.id)}
            exportName="customers"
            searchPlaceholder="Search customers"
            noun="customers"
            height={620}
            pageSize={12}
          />
        )}
      </DataState>
      {open && <Detail id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
