/* Payment links: a seller shares one link to a course, anywhere (a message, a post, an email), and sees who opened it, who
   paid and what it earned. The price is the course's price. A link cannot carry a discount. */
import { useEffect, useState } from 'react'
import { Copy, LinkSimple, Pause, Play, Plus } from '@phosphor-icons/react'
import { createLink, getLinks, setLinkActive } from '@/api/seller.js'
import { useSellerData } from '@/hooks/useSellerData.js'
import { copyText, linkUrl } from '@/lib/links.js'
import { formatNumber, percent } from '@/lib/format.js'
import { useCatalog } from '@/stores/catalog.js'
import { toast } from '@/stores/toasts.js'
import Badge from '@/ui/Badge.jsx'
import { Button } from '@/ui/Button.jsx'
import { Input, Select } from '@/ui/Field.jsx'
import Modal from '@/ui/Modal.jsx'
import PageHeader from '@/ui/PageHeader.jsx'
import { EmptyState, Skeleton } from '@/ui/States.jsx'
import p from '../Page.module.css'
import { shortDate, usd } from './format.js'
import { DataState } from './parts.jsx'
import s from './Seller.module.css'

const WATCH = ['payments']

const STATE = {
  active: { label: 'Active', tone: 'success' },
  paused: { label: 'Paused', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'warning' },
  full: { label: 'Full', tone: 'accent' },
}

/* A date as <input type="date"> takes it, a day from now at the earliest. */
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)

async function copy(code) {
  toast((await copyText(linkUrl(code))) ? 'Link copied.' : 'Copy the link from the box.', { tone: 'success' })
}

function CreateDialog({ products, onClose, onCreated }) {
  const [form, setForm] = useState({ product: products[0]?.slug ?? '', title: '', note: '', maxUses: '', expires: '' })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(null)
  const set = (name) => (event) => setForm((now) => ({ ...now, [name]: event.target.value }))

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const { link } = await createLink({
        product: form.product,
        title: form.title.trim() || undefined,
        note: form.note.trim() || undefined,
        maxUses: form.maxUses ? Number(form.maxUses) : undefined,
        expiresAt: form.expires ? `${form.expires}T23:59:59.000Z` : undefined,
      })
      setCreated(link)
      onCreated()
    } catch (failure) {
      setError(failure.details ? Object.values(failure.details)[0] : failure.message)
    } finally {
      setSaving(false)
    }
  }

  if (created) {
    return (
      <Modal
        open
        size="md"
        title="Your link is ready"
        onClose={onClose}
        footer={
          <>
            <Button icon={Copy} variant="primary" onClick={() => copy(created.code)}>
              Copy link
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        }
      >
        <div className={s.ready}>
          <p>
            Anyone with this link can buy <strong>{created.product.title}</strong> for{' '}
            {usd(created.product.priceUsdCents)}, in their own currency.
          </p>
          <Input label="Link" readOnly value={linkUrl(created.code)} onFocus={(event) => event.target.select()} />
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open
      size="md"
      title="New payment link"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="new-link" loading={saving} disabled={!form.product}>
            Create link
          </Button>
        </>
      }
    >
      <form id="new-link" className={s.form} onSubmit={submit} noValidate>
        <Select
          label="Course"
          value={form.product}
          onChange={set('product')}
          options={products.map((product) => ({
            value: product.slug,
            label: `${product.title}, ${usd(product.priceUsdCents)}`,
          }))}
        />
        <Input
          label="Name"
          placeholder="Shown to the buyer. Defaults to the course."
          maxLength={80}
          value={form.title}
          onChange={set('title')}
        />
        <Input
          label="Note"
          placeholder="A line for the buyer (optional)"
          maxLength={240}
          value={form.note}
          onChange={set('note')}
        />
        <div className={s.formPair}>
          <Input
            label="Limit"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="No limit"
            hint="Stops after this many sales."
            value={form.maxUses}
            onChange={set('maxUses')}
          />
          <Input
            label="Ends on"
            type="date"
            min={tomorrow()}
            hint="Optional."
            value={form.expires}
            onChange={set('expires')}
          />
        </div>
        {error && (
          <p role="alert" className={s.down}>
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

function LinkRow({ link, onToggle, busy }) {
  const state = STATE[link.state] ?? STATE.active
  const url = linkUrl(link.code)

  return (
    <li className={s.link}>
      <div>
        <p className={s.linkTitle}>
          {link.title}
          <Badge tone={state.tone} dot>
            {state.label}
          </Badge>
        </p>
        <p className={s.cellSub}>
          {link.product.title}, {usd(link.product.priceUsdCents)}
          {link.maxUses ? `. Limit ${link.maxUses}` : ''}
          {link.expiresAt ? `. Ends ${shortDate(link.expiresAt)}` : ''}
        </p>
        <div className={s.linkUrl}>
          <code title={url}>{url}</code>
        </div>
      </div>

      <dl className={s.linkStats}>
        <div>
          <dt>Visitors</dt>
          <dd>{formatNumber(link.visits)}</dd>
        </div>
        <div>
          <dt>Paid</dt>
          <dd>
            {formatNumber(link.paid)}
            {link.visits > 0 && <span className={s.cellSub}> {percent(link.conversion, { digits: 0 })}</span>}
          </dd>
        </div>
        <div>
          <dt>Earned</dt>
          <dd>{usd(link.revenueUsdCents)}</dd>
        </div>
      </dl>

      <div className={s.linkActions}>
        <Button size="sm" icon={Copy} onClick={() => copy(link.code)}>
          Copy
        </Button>
        <Button size="sm" icon={link.active ? Pause : Play} loading={busy} onClick={() => onToggle(link)}>
          {link.active ? 'Pause' : 'Resume'}
        </Button>
      </div>
    </li>
  )
}

export default function Links() {
  const state = useSellerData(() => getLinks(), 'links', { watch: WATCH })
  const { products, ensure } = useCatalog()
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    ensure()
  }, [ensure])

  async function toggle(link) {
    setBusy(link.id)
    try {
      await setLinkActive(link.id, !link.active)
      await state.reload({ quiet: true })
      toast(link.active ? 'Link paused. Buyers can no longer use it.' : 'Link is active again.', {
        tone: link.active ? 'neutral' : 'success',
      })
    } catch (error) {
      toast(error.message, { tone: 'danger' })
    } finally {
      setBusy(null)
    }
  }

  const links = state.data?.links ?? []

  return (
    <div className={p.page}>
      <PageHeader
        title="Payment links"
        subtitle="Share a course with one link, get paid anywhere."
        actions={
          <Button variant="primary" icon={Plus} disabled={products.length === 0} onClick={() => setCreating(true)}>
            New link
          </Button>
        }
      />

      <DataState
        state={state}
        onRetry={state.reload}
        skeleton={
          <div className={s.links}>
            {[0, 1, 2].map((id) => (
              <Skeleton key={id} height={110} radius={16} />
            ))}
          </div>
        }
      >
        {state.data && links.length === 0 && (
          <EmptyState
            icon={LinkSimple}
            title="No payment links yet"
            action={
              <Button variant="primary" icon={Plus} disabled={products.length === 0} onClick={() => setCreating(true)}>
                Create your first link
              </Button>
            }
          >
            Make a link to any course, share it anywhere, and see who pays through it.
          </EmptyState>
        )}
        {links.length > 0 && (
          <ul className={s.links} aria-label="Payment links">
            {links.map((link) => (
              <LinkRow key={link.id} link={link} busy={busy === link.id} onToggle={toggle} />
            ))}
          </ul>
        )}
      </DataState>

      {creating && (
        <CreateDialog
          products={products}
          onClose={() => setCreating(false)}
          onCreated={() => state.reload({ quiet: true })}
        />
      )}
    </div>
  )
}
