/* How a payment ended: you are in, or it did not go through and here is why. */
import { ArrowCounterClockwise, SealCheck, WarningCircle } from '@phosphor-icons/react'
import { formatMinor, formatUsd } from '#shared/money.js'
import { useNav } from '@/stores/nav.js'
import { Button } from '@/ui/Button.jsx'
import s from './Checkout.module.css'

export function Paid({ payment, place }) {
  const go = useNav((state) => state.go)
  const when = payment.completedAt
    ? new Date(payment.completedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : ''

  return (
    <section className={s.result} aria-live="polite">
      <span className={s.success}>
        <SealCheck size={44} weight="fill" aria-hidden />
      </span>
      <h2 className={s.stateTitle}>You're in</h2>
      <p className={s.stateText}>{payment.product.title} is unlocked. A receipt is in your notifications.</p>

      <dl className={s.receipt}>
        <div>
          <dt>Paid</dt>
          <dd>
            {formatMinor(payment.displayAmountMinor, {
              currency: payment.displayCurrency,
              minorUnits: place.minorUnits,
            })}
          </dd>
        </div>
        <div>
          <dt>Course price</dt>
          <dd>{formatUsd(payment.amountUsdCents)}</dd>
        </div>
        <div>
          <dt>Method</dt>
          <dd>{payment.method.label} (simulated)</dd>
        </div>
        <div>
          <dt>Reference</dt>
          <dd className={s.mono}>{payment.reference}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{when}</dd>
        </div>
      </dl>

      <div className={s.resultActions}>
        <Button variant="primary" size="lg" onClick={() => go('buyer', 'course', payment.product.slug)}>
          Start learning
        </Button>
        <Button size="lg" onClick={() => go('buyer', 'home')}>
          Back to courses
        </Button>
      </div>
    </section>
  )
}

export function Failed({ payment, onRetry }) {
  return (
    <section className={s.result} aria-live="assertive">
      <span className={s.failure}>
        <WarningCircle size={44} weight="fill" aria-hidden />
      </span>
      <h2 className={s.stateTitle}>Payment did not go through</h2>
      <p className={s.stateText}>{payment.failureMessage} Nothing was charged.</p>
      <p className={s.reference}>
        Reference <span className={s.mono}>{payment.reference}</span>
      </p>
      <div className={s.resultActions}>
        <Button variant="primary" size="lg" icon={ArrowCounterClockwise} onClick={onRetry}>
          Try again
        </Button>
      </div>
    </section>
  )
}
