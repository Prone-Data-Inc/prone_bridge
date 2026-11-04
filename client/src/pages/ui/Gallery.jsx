/* The design system, on one page: tokens, type, every component and chart, in the current theme. Open it at #/ui. */
import { useMemo, useState } from 'react'
import { Bell, CreditCard, Plus, Trash, Export } from '@phosphor-icons/react'
import BarChart from '@/charts/BarChart.jsx'
import DonutChart from '@/charts/DonutChart.jsx'
import Legend from '@/charts/Legend.jsx'
import LineChart from '@/charts/LineChart.jsx'
import MeterList from '@/charts/MeterList.jsx'
import Sparkline from '@/charts/Sparkline.jsx'
import { PAYMENT_STATUS } from '@/lib/status.js'
import { toast } from '@/stores/toasts.js'
import Avatar from '@/ui/Avatar.jsx'
import Badge from '@/ui/Badge.jsx'
import { Button, IconButton } from '@/ui/Button.jsx'
import { Card, StatCard } from '@/ui/Card.jsx'
import { Input, Select, Toggle } from '@/ui/Field.jsx'
import LazyDataGrid from '@/ui/LazyDataGrid.jsx'
import Menu from '@/ui/Menu.jsx'
import Modal from '@/ui/Modal.jsx'
import PageHeader from '@/ui/PageHeader.jsx'
import Segmented from '@/ui/Segmented.jsx'
import { EmptyState, Skeleton, Spinner } from '@/ui/States.jsx'
import Table from '@/ui/Table.jsx'
import { CountryCell, MethodCell, MoneyCell, StatusCell } from '@/ui/grid/cells.jsx'
import { formatUsd } from '#shared/money.js'
import { COUNTRY_RANKING, DAYS, METHOD_MIX, samplePayments, sampleSeries } from './sample.js'
import s from './Gallery.module.css'

const SWATCHES = [
  ['--accent', 'Accent'],
  ['--accent-soft', 'Accent soft'],
  ['--bg', 'Background'],
  ['--surface', 'Surface'],
  ['--text', 'Text'],
  ['--text-3', 'Muted text'],
  ['--success', 'Success'],
  ['--warning', 'Warning'],
  ['--danger', 'Danger'],
  ['--series-1', 'Series 1'],
  ['--series-2', 'Series 2'],
  ['--series-3', 'Series 3'],
  ['--series-4', 'Series 4'],
]

const TYPE = [
  ['Display', 'var(--fs-3xl)', 600],
  ['Title', 'var(--fs-2xl)', 600],
  ['Heading', 'var(--fs-xl)', 600],
  ['Lead', 'var(--fs-lg)', 500],
  ['Body', 'var(--fs-md)', 400],
  ['Interface', 'var(--fs-sm)', 400],
  ['Caption', 'var(--fs-xs)', 400],
]

const COLUMNS = [
  { field: 'reference', headerName: 'Payment', pinned: 'left', width: 150 },
  {
    field: 'date',
    headerName: 'Date',
    width: 130,
    sort: 'desc',
    filter: 'agDateColumnFilter',
    valueFormatter: ({ value }) => value.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  },
  { field: 'customer', headerName: 'Customer', flex: 1, minWidth: 160 },
  { field: 'country', headerName: 'Country', width: 190, cellRenderer: CountryCell },
  { field: 'method', headerName: 'Method', width: 210, cellRenderer: MethodCell },
  {
    field: 'amount',
    headerName: 'Amount',
    width: 130,
    type: 'rightAligned',
    filter: 'agNumberColumnFilter',
    cellRenderer: MoneyCell,
  },
  { field: 'status', headerName: 'Status', width: 150, cellRenderer: StatusCell },
]

const TABLE_COLUMNS = [
  { key: 'country', label: 'Country' },
  { key: 'method', label: 'Top method' },
  {
    key: 'status',
    label: 'Health',
    render: (row) => (
      <Badge tone={row.tone} dot>
        {row.health}
      </Badge>
    ),
  },
  { key: 'volume', label: 'Volume', align: 'right' },
]

const TABLE_ROWS = [
  { id: 1, country: "Côte d'Ivoire", method: 'Mobile money', health: 'Healthy', tone: 'success', volume: '$3,140' },
  { id: 2, country: 'Nigeria', method: 'Bank transfer', health: 'Degraded', tone: 'warning', volume: '$2,480' },
  { id: 3, country: 'Kenya', method: 'Card', health: 'Down', tone: 'danger', volume: '$980' },
]

function Section({ title, note, children }) {
  return (
    <section className={s.section}>
      <header className={s.head}>
        <h2 className={s.title}>{title}</h2>
        {note && <p className={s.note}>{note}</p>}
      </header>
      {children}
    </section>
  )
}

const usd = (cents) => formatUsd(cents * 100).replace('.00', '')

export default function Gallery() {
  const { volume, previous, payments } = useMemo(() => sampleSeries(), [])
  const rows = useMemo(() => samplePayments(60), [])
  const [range, setRange] = useState('30d')
  const [tab, setTab] = useState('all')
  const [on, setOn] = useState(true)
  const [modal, setModal] = useState(false)

  return (
    <div className={s.page}>
      <PageHeader
        title="Design system"
        subtitle="Every piece of the interface, in the current theme. Switch the theme from the toolbar."
      />

      <Section title="Color" note="Every color is a token. A theme is one block of variables.">
        <div className={s.swatches}>
          {SWATCHES.map(([token, name]) => (
            <div key={token} className={s.swatch}>
              <span className={s.chip} style={{ background: `var(${token})` }} />
              <span className={s.swatchName}>{name}</span>
              <code className={s.token}>{token}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type" note="Inter, two weights in use. Sizes follow a fixed scale.">
        <div className={s.type}>
          {TYPE.map(([name, size, weight]) => (
            <div key={name} className={s.typeRow}>
              <span className={s.typeName}>{name}</span>
              <span style={{ fontSize: size, fontWeight: weight, lineHeight: 1.2 }}>Get paid across Africa</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className={s.row}>
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger" icon={Trash}>
            Delete
          </Button>
          <Button variant="dangerGhost">Remove</Button>
          <Button variant="primary" icon={Plus}>
            With icon
          </Button>
          <Button variant="primary" loading>
            Saving
          </Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className={s.row}>
          <Button variant="primary" size="sm">
            Small
          </Button>
          <Button variant="primary" size="lg">
            Large
          </Button>
          <IconButton icon={Bell} label="Notifications" />
          <IconButton icon={Bell} label="Notifications" badge />
          <IconButton icon={Bell} label="Notifications" badge={4} />
          <IconButton icon={Bell} label="Notifications" badge={12} />
        </div>
      </Section>

      <Section title="Badges and status" note="One status map feeds every table, badge and chart.">
        <div className={s.row}>
          <Badge>Neutral</Badge>
          <Badge tone="accent">Accent</Badge>
          <Badge tone="success">Success</Badge>
          <Badge tone="warning">Warning</Badge>
          <Badge tone="danger">Danger</Badge>
        </div>
        <div className={s.row}>
          {Object.entries(PAYMENT_STATUS).map(([key, { label, tone }]) => (
            <Badge key={key} tone={tone} dot>
              {label}
            </Badge>
          ))}
        </div>
        <div className={s.row}>
          <Avatar name="Aminata Diallo" />
          <Avatar name="Kofi Mensah" />
          <Avatar name="Chidi Okafor" />
          <Avatar name="Prone Data Learning" size={36} />
        </div>
      </Section>

      <Section title="Form">
        <div className={s.form}>
          <Input label="Email" placeholder="you@example.com" hint="We send your receipt here." />
          <Input label="Card number" defaultValue="4242 4242" error="Check the card number." />
          <Select
            label="Country"
            defaultValue="CI"
            options={[
              { value: 'CI', label: "Côte d'Ivoire" },
              { value: 'NG', label: 'Nigeria' },
              { value: 'KE', label: 'Kenya' },
            ]}
          />
          <div className={s.stack}>
            <Toggle checked={on} onChange={setOn} label="Mobile money" />
            <Toggle checked={false} onChange={() => {}} label="Disabled" disabled />
          </div>
        </div>
        <div className={s.row}>
          <Segmented
            label="Range"
            value={range}
            onChange={setRange}
            options={[
              { value: '7d', label: '7 days' },
              { value: '30d', label: '30 days' },
              { value: '90d', label: '90 days' },
            ]}
          />
          <Segmented
            variant="text"
            label="Filter"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'all', label: 'All' },
              { value: 'paid', label: 'Paid' },
              { value: 'failed', label: 'Failed' },
            ]}
          />
        </div>
      </Section>

      <Section
        title="Stat cards"
        note="A KPI with its change. Green means good news for that number, even when it goes down."
      >
        <div className={s.stats}>
          <StatCard label="Volume" value={usd(128_430)} delta={0.124} tone={1}>
            <Sparkline values={volume} caption="Volume over 30 days" />
          </StatCard>
          <StatCard label="Success rate" value="93.1%" delta={0.012} tone={2}>
            <Sparkline values={payments} color="var(--series-3)" caption="Payments over 30 days" />
          </StatCard>
          <StatCard label="Fraud blocked" value="0.7%" delta={-0.003} goodWhen="down" tone={1}>
            <Sparkline values={[...payments].reverse()} color="var(--series-2)" caption="Blocked payments" />
          </StatCard>
        </div>
      </Section>

      <Section title="Charts" note="Drawn in SVG. Hover or use the arrow keys. A table twin serves screen readers.">
        <div className={s.charts}>
          <Card
            title="Volume"
            action={
              <Legend
                items={[
                  { label: 'This period', color: 'var(--series-1)' },
                  { label: 'Last period', color: 'var(--series-other)', dashed: true },
                ]}
              />
            }
          >
            <LineChart
              labels={DAYS}
              caption="Volume by day"
              format={usd}
              series={[
                { label: 'This period', values: volume, color: 'var(--series-1)', area: true },
                { label: 'Last period', values: previous, color: 'var(--series-other)', dashed: true },
              ]}
            />
          </Card>
          <Card title="Payments per day">
            <BarChart
              data={DAYS.map((label, i) => ({ label, value: payments[i] }))}
              seriesLabel="Payments"
              format={(value) => `${value}`}
              caption="Payments per day"
            />
          </Card>
          <Card title="Payment methods">
            <DonutChart
              caption="Share of volume by method"
              format={usd}
              center={{ value: usd(9310), label: 'Volume' }}
              data={METHOD_MIX.map((part, i) => ({ ...part, color: `var(--series-${i + 1})` }))}
            />
          </Card>
          <Card title="Top countries">
            <MeterList data={COUNTRY_RANKING} format={usd} caption="Volume by country" />
          </Card>
        </div>
      </Section>

      <Section title="Tables" note="A plain table for short lists. Long lists use the data grid.">
        <Card flush>
          <Table
            columns={TABLE_COLUMNS}
            rows={TABLE_ROWS}
            caption="Countries"
            onRowClick={(row) => toast(`${row.country} opened`)}
          />
        </Card>
      </Section>

      <Section
        title="Data grid"
        note="AG Grid Community, themed by our tokens. Sort, filter, resize, search, page and export."
      >
        <LazyDataGrid
          rows={rows}
          columns={COLUMNS}
          getRowId={(row) => row.id}
          exportName="sample-payments"
          searchPlaceholder="Search payments"
          noun="payments"
          height={520}
        />
      </Section>

      <Section title="Overlays and messages">
        <div className={s.row}>
          <Menu
            items={[
              { label: 'View payment', icon: CreditCard, onClick: () => toast('Opened') },
              { label: 'Export', icon: Export, onClick: () => toast('Exported', { tone: 'success' }) },
              {
                label: 'Refund',
                icon: Trash,
                danger: true,
                onClick: () => toast('Refund needs a reason', { tone: 'warning' }),
              },
            ]}
          />
          <Button onClick={() => setModal(true)}>Open dialog</Button>
          <Button
            onClick={() => toast('Payment received', { tone: 'success', title: 'Seller', eyebrow: 'Notification' })}
          >
            Success toast
          </Button>
          <Button onClick={() => toast('Check the amount.', { tone: 'warning' })}>Warning toast</Button>
          <Button onClick={() => toast('That did not go through.', { tone: 'danger' })}>Error toast</Button>
        </div>
        <Modal
          open={modal}
          onClose={() => setModal(false)}
          title="Refund this payment?"
          footer={
            <>
              <Button onClick={() => setModal(false)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  setModal(false)
                  toast('Refund started')
                }}
              >
                Refund
              </Button>
            </>
          }
        >
          The buyer gets the full amount back and loses access to the course.
        </Modal>
      </Section>

      <Section title="Loading and empty">
        <div className={s.states}>
          <Card title="Loading">
            <div className={s.stack}>
              <Skeleton height={20} width="60%" />
              <Skeleton height={14} />
              <Skeleton height={14} width="80%" />
              <Spinner />
            </div>
          </Card>
          <Card title="Empty">
            <EmptyState
              icon={CreditCard}
              title="No payments yet"
              action={<Button variant="primary">Share a payment link</Button>}
            >
              Sales will show up here as they happen.
            </EmptyState>
          </Card>
        </div>
      </Section>
    </div>
  )
}
