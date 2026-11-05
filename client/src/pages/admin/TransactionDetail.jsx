/* One payment, opened for the admin: what it was, who paid and who sold, how the risk rules rated it, and what happened
   to it, step by step. A payment waiting for a review can be decided from here. */
import { useState } from 'react'
import { formatMinor } from '#shared/money.js'
import { getTransaction } from '@/api/admin.js'
import { useSellerData } from '@/hooks/useSellerData.js'
import { capitalize } from '@/lib/format.js'
import { statusLabel, statusTone } from '@/lib/status.js'
import Badge from '@/ui/Badge.jsx'
import { Button } from '@/ui/Button.jsx'
import Modal from '@/ui/Modal.jsx'
import { Skeleton } from '@/ui/States.jsx'
import { dateTime, usd } from '../seller/format.js'
import { DataState } from '../seller/parts.jsx'
import s from '../seller/Seller.module.css'
import DecisionDialog from './DecisionDialog.jsx'
import { AssessmentPanel } from './parts.jsx'

/* The AI's note for a payment arrives a moment after the payment, so a new rating reloads this too. */
const WATCH = ['payments', 'risk_assessments']

/* Digits after the point for a currency, so XOF 23,400 has none and NGN 58,500.00 has two. */
const digitsOf = (currency) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits

const methodText = (payment) =>
  payment.card ? `${capitalize(payment.card.brand ?? 'card')} ending ${payment.card.last4}` : payment.method.label

function Body({ payment, timeline, assessment }) {
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
          <dt>Seller</dt>
          <dd>{payment.merchant.name}</dd>
        </div>
        <div>
          <dt>Course</dt>
          <dd>{payment.product.title}</dd>
        </div>
        <div>
          <dt>Price</dt>
          <dd>{usd(payment.amountUsdCents)}</dd>
        </div>
        <div>
          <dt>ProneBridge fee</dt>
          <dd>{usd(payment.feeUsdCents)}</dd>
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
          <dt>Method</dt>
          <dd>{methodText(payment)}</dd>
        </div>
        <div>
          <dt>Buyer</dt>
          <dd>
            {payment.buyer.name}
            <span className={s.cellSub}>{payment.buyer.email}</span>
          </dd>
        </div>
        <div>
          <dt>Country</dt>
          <dd>{payment.country.name}</dd>
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

      {assessment ? (
        <AssessmentPanel assessment={assessment} />
      ) : (
        <p className={s.muted}>This payment was not scored.</p>
      )}

      <section aria-labelledby="timeline-title">
        <h3 id="timeline-title" className={s.heading}>
          What happened
        </h3>
        <ol className={s.timeline}>
          {timeline.map((step, index) => (
            <li key={`${step.type}-${index}`} data-bad={step.type === 'failed' || step.type === 'blocked' || undefined}>
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

export default function TransactionDetail({ id, onClose }) {
  const state = useSellerData(() => getTransaction(id), id, { watch: WATCH })
  const [deciding, setDeciding] = useState(null)
  const payment = state.data?.payment

  return (
    <>
      <Modal
        open
        size="lg"
        title={payment ? `Payment ${payment.reference}` : 'Payment'}
        onClose={onClose}
        footer={
          <>
            {payment?.status === 'in_review' && (
              <>
                <Button variant="danger" onClick={() => setDeciding('reject')}>
                  Reject
                </Button>
                <Button variant="primary" onClick={() => setDeciding('approve')}>
                  Approve
                </Button>
              </>
            )}
            <Button onClick={onClose}>Close</Button>
          </>
        }
      >
        <DataState
          state={state}
          onRetry={state.reload}
          skeleton={
            <div className={s.detail}>
              <Skeleton height={24} width="40%" />
              <Skeleton height={140} radius={12} />
              <Skeleton height={160} radius={12} />
            </div>
          }
        >
          {state.data && <Body {...state.data} />}
        </DataState>
      </Modal>
      {deciding && payment && (
        <DecisionDialog
          payment={payment}
          action={deciding}
          onClose={() => setDeciding(null)}
          onDone={() => state.reload({ quiet: true })}
        />
      )}
    </>
  )
}
