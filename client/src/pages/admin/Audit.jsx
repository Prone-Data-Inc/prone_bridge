/* The audit log: what happened, and who did it. Sellers, the admin, the AI, PayPal and the system all write here. */
import { useMemo, useState } from 'react'
import { ClipboardText } from '@phosphor-icons/react'
import { getAudit } from '@/api/admin.js'
import { useSellerData } from '@/hooks/useSellerData.js'
import Badge from '@/ui/Badge.jsx'
import { Button } from '@/ui/Button.jsx'
import { Select } from '@/ui/Field.jsx'
import LazyDataGrid from '@/ui/LazyDataGrid.jsx'
import Modal from '@/ui/Modal.jsx'
import PageHeader from '@/ui/PageHeader.jsx'
import { EmptyState, Skeleton } from '@/ui/States.jsx'
import p from '../Page.module.css'
import { dateTime } from '../seller/format.js'
import { DataState } from '../seller/parts.jsx'
import s from '../seller/Seller.module.css'
import a from './Admin.module.css'

const WATCH = ['payments', 'payouts', 'notifications']

const ACTORS = [
  { value: '', label: 'Everyone' },
  { value: 'admin', label: 'Admin' },
  { value: 'seller', label: 'Sellers' },
  { value: 'buyer', label: 'Buyers' },
  { value: 'ai', label: 'The AI' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'system', label: 'The system' },
]

const TONE = {
  admin: 'accent',
  ai: 'warning',
  seller: 'success',
  paypal: 'neutral',
  buyer: 'neutral',
  system: 'neutral',
}
const actorLabel = (actor) => ACTORS.find((entry) => entry.value === actor)?.label ?? actor

function ActorCell({ value }) {
  return <Badge tone={TONE[value] ?? 'neutral'}>{actorLabel(value)}</Badge>
}

/* "country: KE, method: mobile_money" for the row, in full when opened. */
const summary = (data) =>
  Object.entries(data ?? {})
    .filter(([, value]) => typeof value !== 'object' || value === null)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ')

const COLUMNS = [
  {
    field: 'at',
    headerName: 'When',
    width: 170,
    sort: 'desc',
    filter: false,
    valueFormatter: ({ value }) => dateTime(value),
  },
  {
    field: 'actor',
    headerName: 'Who',
    width: 130,
    cellRenderer: ActorCell,
    valueFormatter: ({ value }) => actorLabel(value),
  },
  { field: 'actorId', headerName: 'Name', width: 140 },
  { field: 'action', headerName: 'What', width: 210 },
  { field: 'entity', headerName: 'On', width: 240 },
  { field: 'details', headerName: 'Details', flex: 1, minWidth: 260 },
]

const toRow = (entry) => ({
  id: entry.id,
  at: new Date(entry.at),
  actor: entry.actor,
  actorId: entry.actorId ?? '',
  action: entry.action,
  entity: [entry.entityType, entry.entityId].filter(Boolean).join(' '),
  details: summary(entry.data),
  data: entry.data,
})

export default function Audit() {
  const [actor, setActor] = useState('')
  const [open, setOpen] = useState(null)
  const query = useMemo(() => ({ actor, limit: 500 }), [actor])
  const state = useSellerData(() => getAudit(query), JSON.stringify(query), { watch: WATCH })

  const rows = useMemo(() => state.data?.entries.map(toRow) ?? [], [state.data])
  const total = state.data?.total ?? 0

  return (
    <div className={p.page}>
      <PageHeader title="Audit log" subtitle="What happened, and who did it." />

      <div className={s.filters}>
        <Select
          label="Who"
          className={s.filterSelect}
          value={actor}
          onChange={(event) => setActor(event.target.value)}
          options={ACTORS}
        />
        {actor && (
          <Button variant="ghost" onClick={() => setActor('')}>
            Clear filter
          </Button>
        )}
      </div>

      <DataState state={state} onRetry={state.reload} skeleton={<Skeleton height={600} radius={16} />}>
        {state.data && rows.length === 0 && (
          <EmptyState icon={ClipboardText} title="Nothing here yet">
            Changes show up here as they happen.
          </EmptyState>
        )}
        {state.data && rows.length > 0 && (
          <>
            {total > rows.length && (
              <p className={s.note}>
                Showing the latest {rows.length.toLocaleString('en-US')} of {total.toLocaleString('en-US')} entries.
              </p>
            )}
            <LazyDataGrid
              rows={rows}
              columns={COLUMNS}
              getRowId={(row) => String(row.id)}
              onRowClick={(row) => setOpen(row)}
              exportName="audit-log"
              searchPlaceholder="Search the audit log"
              noun="entries"
              height={620}
              pageSize={12}
            />
          </>
        )}
      </DataState>

      {open && (
        <Modal
          open
          title={open.action}
          onClose={() => setOpen(null)}
          footer={<Button onClick={() => setOpen(null)}>Close</Button>}
        >
          <div className={s.detail}>
            <dl className={s.detailGrid}>
              <div>
                <dt>When</dt>
                <dd>{dateTime(open.at)}</dd>
              </div>
              <div>
                <dt>Who</dt>
                <dd>
                  {actorLabel(open.actor)}
                  {open.actorId ? <span className={s.cellSub}>{open.actorId}</span> : null}
                </dd>
              </div>
              <div>
                <dt>On</dt>
                <dd>{open.entity || 'Nothing in particular'}</dd>
              </div>
            </dl>
            <pre className={a.json}>{JSON.stringify(open.data, null, 2)}</pre>
          </div>
        </Modal>
      )}
    </div>
  )
}
