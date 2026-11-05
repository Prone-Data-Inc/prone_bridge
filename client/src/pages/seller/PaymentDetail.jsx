/* One payment, opened: what it was, who paid, what the seller receives, and what happened to it, step by step. */
import { formatMinor } from '#shared/money.js'
import { useSellerData } from '@/hooks/useSellerData.js'
import { getPayment } from '@/api/seller.js'
import { statusLabel, statusTone } from '@/lib/status.js'
import { capitalize } from '@/lib/format.js'
import Badge from '@/ui/Badge.jsx'
import { Button } from '@/ui/Button.jsx'
import Modal from '@/ui/Modal.jsx'
import { Skeleton } from '@/ui/States.jsx'
import { dateTime, usd } from './format.js'
import { DataState } from './parts.jsx'
import s from './Seller.module.css'

/* Digits after the point for a currency, so XOF 23,400 has none and NGN 58,500.00 has two. */
const digitsOf = (currency) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits

const methodText = (payment) =>
  payment.card ? `${capitalize(payment.card.brand ?? 'card')} ending ${payment.card.last4}` : payment.method.label

function Body({ payment, timeline }) {
  const local = payment.displayCurrency !== 'USD'
  return (
    <div className={s.detail}>
      <div className={s.cell}>
        <Badge tone={statusTone(payment.status)} dot>
          {statusLabel(payment.status)}
        </Badge>
        <span className={s.tag}>{payment.simulated ? 'Simulated' : 'PayPal sandbox'}</span>
        {payment.failureMessage && <span className={s.muted}>{payment.failureMessage}</span>}
      </div>

      <dl className={s.detailGrid}>
        <div>
          <dt>Price</dt>
          <dd>{usd(payment.amountUsdCents)}</dd>
        </div>
        <div>
          <dt>You receive</dt>
          <dd>{usd(payment.netUsdCents)}</dd>
        </div>
        {local && (
          <div>
            <dt>Buyer paid</dt>
            <dd>
              {formatMinor(payment.displayAmountMinor, {
                currency: payment.displayCurrency,
                minorUnits: digitsOf(payment.displayCurrency),
              })}
            </dd>
          </div>
        )}
        <div>
          <dt>ProneBridge fee</dt>
          <dd>{usd(payment.feeUsdCents)}</dd>
        </div>
        <div>
          <dt>Method</dt>
          <dd>{methodText(payment)}</dd>
        </div>
        <div>
          <dt>Country</dt>
          <dd>{payment.country.name}</dd>
        </div>
        <div>
          <dt>Customer</dt>
          <dd>
            {payment.buyer.name}
            <span className={s.cellSub}>{payment.buyer.email}</span>
          </dd>
        </div>
        <div>
          <dt>Course</dt>
          <dd>{payment.product.title}</dd>
        </div>
        {payment.link && (
          <div>
            <dt>Payment link</dt>
            <dd>{payment.link.title}</dd>
          </div>
        )}
        <div>
          <dt>Payout</dt>
          <dd>
            {payment.status !== 'succeeded' ? 'Not applicable' : payment.paidOut ? 'Paid out' : 'Waiting for a payout'}
          </dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{dateTime(payment.createdAt)}</dd>
        </div>
        {payment.completedAt && (
          <div>
            <dt>Finished</dt>
            <dd>{dateTime(payment.completedAt)}</dd>
          </div>
        )}
      </dl>

      <section aria-labelledby="timeline-title">
        <h3 id="timeline-title" className={s.heading}>
          What happened
        </h3>
        <ol className={s.timeline}>
          {timeline.map((step, index) => (
            <li key={`${step.type}-${index}`} data-bad={step.type === 'failed' || undefined}>
              <p className={s.stepTitle}>{step.label}</p>
              <p className={s.cellSub}>
                {dateTime(step.at)}
                {step.detail ? `. ${step.detail}` : ''}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

export default function PaymentDetail({ id, onClose }) {
  const state = useSellerData(() => getPayment(id), id)
  const reference = state.data?.payment.reference

  return (
    <Modal
      open
      size="lg"
      title={reference ? `Payment ${reference}` : 'Payment'}
      onClose={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <DataState
        state={state}
        onRetry={state.reload}
        skeleton={
          <div className={s.detail}>
            <Skeleton height={24} width="40%" />
            <Skeleton height={140} radius={12} />
            <Skeleton height={90} radius={12} />
          </div>
        }
      >
        {state.data && <Body payment={state.data.payment} timeline={state.data.timeline} />}
      </DataState>
    </Modal>
  )
}
