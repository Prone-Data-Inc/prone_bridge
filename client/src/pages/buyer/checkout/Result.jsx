/* How a payment ended: you are in, it did not go through and here is why, PayPal is still confirming it, or the safety
   check is holding it (waiting, cleared, or stopped). The safety screens never say why: the same words for everyone. */
import { ArrowCounterClockwise, Clock, SealCheck, ShieldWarning, WarningCircle } from '@phosphor-icons/react'
import { formatMinor, formatUsd } from '#shared/money.js'
import { capitalize } from '@/lib/format.js'
import { useNav } from '@/stores/nav.js'
import { Button } from '@/ui/Button.jsx'
import s from './Checkout.module.css'

/* "Mobile money (simulated)", "Visa ending 1881 (PayPal sandbox)", "PayPal (PayPal sandbox)". */
const methodText = (payment) => {
  if (payment.simulated) return `${payment.method.label} (simulated)`
  if (payment.card) return `${capitalize(payment.card.brand ?? 'card')} ending ${payment.card.last4} (PayPal sandbox)`
  return `${payment.method.label} (PayPal sandbox)`
}

export function Paid({ payment, place }) {
  const go = useNav((state) => state.go)
  const when = payment.completedAt
    ? new Date(payment.completedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : ''
  const inDollars = payment.displayCurrency === 'USD'

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
              minorUnits: inDollars ? 2 : place.minorUnits,
            })}
          </dd>
        </div>
        {!inDollars && (
          <div>
            <dt>Course price</dt>
            <dd>{formatUsd(payment.amountUsdCents)}</dd>
          </div>
        )}
        <div>
          <dt>Method</dt>
          <dd>{methodText(payment)}</dd>
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

/* PayPal has the money but has not confirmed it yet. The buyer is told as soon as it does, by a notification. */
export function Pending({ payment }) {
  const go = useNav((state) => state.go)
  return (
    <section className={s.result} aria-live="polite">
      <span className={s.pendingIcon}>
        <Clock size={44} weight="fill" aria-hidden />
      </span>
      <h2 className={s.stateTitle}>Payment pending</h2>
      <p className={s.stateText}>
        PayPal is still confirming your payment. We will tell you as soon as it goes through.
      </p>
      <p className={s.reference}>
        Reference <span className={s.mono}>{payment.reference}</span>
      </p>
      <div className={s.resultActions}>
        <Button size="lg" onClick={() => go('buyer', 'home')}>
          Back to courses
        </Button>
      </div>
    </section>
  )
}

/* The safety check is holding the payment for a person. Nothing was charged. The page updates by itself. */
export function Review({ payment }) {
  const go = useNav((state) => state.go)
  return (
    <section className={s.result} aria-live="polite">
      <span className={s.pendingIcon}>
        <Clock size={44} weight="fill" aria-hidden />
      </span>
      <h2 className={s.stateTitle}>We are checking your payment</h2>
      <p className={s.stateText}>
        This is a routine safety check. It usually takes a few minutes. Nothing has been charged. You can stay on this
        page: it updates the moment the check is done.
      </p>
      <p className={s.reference}>
        Reference <span className={s.mono}>{payment.reference}</span>
      </p>
      <div className={s.resultActions}>
        <Button size="lg" onClick={() => go('buyer', 'home')}>
          Back to courses
        </Button>
      </div>
    </section>
  )
}

/* A person cleared it. The same payment goes on when the buyer presses Continue. */
export function Cleared({ payment, onContinue }) {
  return (
    <section className={s.result} aria-live="polite">
      <span className={s.success}>
        <SealCheck size={44} weight="fill" aria-hidden />
      </span>
      <h2 className={s.stateTitle}>The check is done</h2>
      <p className={s.stateText}>You can finish paying now. Nothing has been charged yet.</p>
      <p className={s.reference}>
        Reference <span className={s.mono}>{payment.reference}</span>
      </p>
      <div className={s.resultActions}>
        <Button variant="primary" size="lg" onClick={onContinue}>
          Continue to pay
        </Button>
      </div>
    </section>
  )
}

/* The safety check stopped it, at once or after a person looked. No reason is given, and nothing was charged. */
export function Blocked({ payment }) {
  const go = useNav((state) => state.go)
  return (
    <section className={s.result} aria-live="assertive">
      <span className={s.failure}>
        <ShieldWarning size={44} weight="fill" aria-hidden />
      </span>
      <h2 className={s.stateTitle}>Payment not completed</h2>
      <p className={s.stateText}>{payment.failureMessage} Nothing was charged.</p>
      <p className={s.reference}>
        Reference <span className={s.mono}>{payment.reference}</span>
      </p>
      <div className={s.resultActions}>
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
