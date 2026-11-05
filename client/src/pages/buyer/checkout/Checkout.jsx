/* The ProneBridge checkout, in the style of a hosted payment page: what you are buying on the left, how you pay on the right.
   The buyer picks a country, sees the price in their currency and the methods that country can use, and pays. The seller
   never sees a card number or a phone number: ProneBridge takes the payment and pays the seller. */
import { useEffect } from 'react'
import { LockSimple, WarningCircle } from '@phosphor-icons/react'
import { formatMinor } from '#shared/money.js'
import { productBySlug, useCatalog } from '@/stores/catalog.js'
import { useLearner } from '@/stores/learner.js'
import { useNav } from '@/stores/nav.js'
import { useSession } from '@/stores/session.js'
import { Button } from '@/ui/Button.jsx'
import { Input, Select } from '@/ui/Field.jsx'
import { EmptyState, Skeleton, Spinner } from '@/ui/States.jsx'
import CardPay from './CardPay.jsx'
import MethodDetails from './MethodDetails.jsx'
import MethodList from './MethodList.jsx'
import OrderSummary from './OrderSummary.jsx'
import PaypalPay from './PaypalPay.jsx'
import { Blocked, Cleared, Failed, Paid, Pending, Review } from './Result.jsx'
import { useCheckout } from './useCheckout.js'
import Waiting from './Waiting.jsx'
import s from './Checkout.module.css'

function Problem({ problem, onOpen, onNewBuyer, onRetry }) {
  const owned = problem.status === 409 && /already own/i.test(problem.message)
  return (
    <div className={s.problem} role="alert">
      <WarningCircle size={18} weight="fill" aria-hidden />
      <div>
        <p>{problem.message}</p>
        {owned && (
          <p className={s.problemActions}>
            <button type="button" onClick={onOpen}>
              Open the course
            </button>
            <button type="button" onClick={onNewBuyer}>
              Use a new demo buyer
            </button>
          </p>
        )}
        {problem.retry && (
          <p className={s.problemActions}>
            <button type="button" onClick={onRetry}>
              Confirm the payment again
            </button>
          </p>
        )}
      </div>
    </div>
  )
}

function Flow({ product, link }) {
  const go = useNav((state) => state.go)
  const buyer = useSession((state) => state.buyer)
  const unlocked = useLearner((state) => state.courses.some((course) => course.id === product.id))
  const countries = useCatalog((state) => state.countries)
  const checkout = useCheckout(product, link)
  const { place, method, price, viaPaypal, contact, phase, problem } = checkout

  /* Owning the course only matters for the person who owns it. With a new demo buyer in the form, it can be bought again. */
  const owned = unlocked && contact.email.trim().toLowerCase() === (buyer?.email ?? '').toLowerCase()

  const total = price ? formatMinor(price.amount, price) : null

  const submit = (event) => {
    event.preventDefault()
    checkout.pay()
  }

  let main
  if (phase === 'creating') {
    main = (
      <section className={s.waiting} aria-live="polite" aria-busy="true">
        <Spinner size={32} label="Starting your payment" />
        <h2 className={s.stateTitle}>Starting your payment</h2>
      </section>
    )
  } else if (phase === 'confirming') {
    main = (
      <section className={s.waiting} aria-live="polite" aria-busy="true">
        <Spinner size={32} label="Confirming your payment" />
        <h2 className={s.stateTitle}>Confirming your payment</h2>
        <p className={s.stateText}>This takes a moment.</p>
      </section>
    )
  } else if (phase === 'waiting') {
    main = <Waiting payment={checkout.payment} place={place} phone={checkout.phone} />
  } else if (phase === 'paid') {
    main = <Paid payment={checkout.payment} place={place} />
  } else if (phase === 'pending') {
    main = <Pending payment={checkout.payment} />
  } else if (phase === 'review') {
    main = <Review payment={checkout.payment} />
  } else if (phase === 'cleared') {
    main = <Cleared payment={checkout.payment} onContinue={checkout.continueAfterReview} />
  } else if (phase === 'blocked') {
    main = <Blocked payment={checkout.payment} />
  } else if (phase === 'failed') {
    main = <Failed payment={checkout.payment} onRetry={checkout.tryAgain} />
  } else if (owned && !problem) {
    main = (
      <EmptyState
        icon={LockSimple}
        title="You already own this course"
        action={
          <div className={s.ownedActions}>
            <Button variant="primary" onClick={() => go('buyer', 'course', product.slug)}>
              Open course
            </Button>
            <Button variant="ghost" onClick={checkout.useNewBuyer}>
              Use a new demo buyer
            </Button>
          </div>
        }
      >
        Nothing to pay. It is in My courses.
      </EmptyState>
    )
  } else {
    main = (
      <form className={s.form} onSubmit={submit} noValidate>
        <section className={s.section} aria-labelledby="contact-title">
          <h2 id="contact-title" className={s.sectionTitle}>
            Contact
          </h2>
          <div className={s.fields}>
            <Input
              label="Full name"
              autoComplete="name"
              value={contact.name}
              onChange={(event) => checkout.editContact({ name: event.target.value })}
              error={problem?.fields?.['buyer.name']}
            />
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={contact.email}
              onChange={(event) => checkout.editContact({ email: event.target.value })}
              error={problem?.fields?.['buyer.email']}
              hint="Demo only. Use a made-up address."
            />
          </div>
          <button type="button" className={s.link} onClick={checkout.useNewBuyer}>
            Use a new demo buyer
          </button>
        </section>

        <section className={s.section} aria-labelledby="country-title">
          <h2 id="country-title" className={s.sectionTitle}>
            Country
          </h2>
          <Select
            label="Where are you paying from?"
            value={checkout.country}
            onChange={(event) => checkout.chooseCountry(event.target.value)}
            options={countries.map((entry) => ({ value: entry.code, label: entry.name }))}
            hint={place ? `You pay in ${place.currencyName} (${place.currency}).` : undefined}
          />
        </section>

        <section className={s.section} aria-labelledby="method-title">
          <h2 id="method-title" className={s.sectionTitle}>
            Payment method
          </h2>
          <MethodList
            methods={checkout.methods}
            selectedId={method?.id}
            onChoose={checkout.chooseMethod}
            ready={checkout.ready}
            bestId={checkout.bestId}
          />
          <MethodDetails
            method={method}
            phone={checkout.phone}
            onPhone={checkout.setPhone}
            outcome={checkout.outcome}
            onOutcome={checkout.setOutcome}
          />
        </section>

        {problem && (
          <Problem
            problem={problem}
            onOpen={() => go('buyer', 'course', product.slug)}
            onNewBuyer={checkout.useNewBuyer}
            onRetry={checkout.retryCapture}
          />
        )}

        <div className={s.pay}>
          {method?.kind === 'card' && <CardPay checkout={checkout} total={total} />}
          {method?.kind === 'paypal' && <PaypalPay checkout={checkout} />}
          {!viaPaypal && (
            <Button type="submit" variant="primary" size="lg" className={s.payButton} disabled={!checkout.valid}>
              {total ? `Pay ${total}` : 'Pay'}
            </Button>
          )}
          <p className={s.payNote}>
            <LockSimple size={14} aria-hidden />
            {method?.simulated
              ? 'Simulated payment. No money moves.'
              : method
                ? 'PayPal sandbox payment. No money moves.'
                : 'Choose a payment method.'}
          </p>
        </div>
      </form>
    )
  }

  return (
    <div className={s.page}>
      <OrderSummary product={product} place={place} price={price} viaPaypal={viaPaypal} link={link} />
      <main className={s.main}>
        <div className={s.mainInner}>{main}</div>
      </main>
    </div>
  )
}

/* link: a payment link this checkout came through, with its title and note. */
export default function Checkout({ param: slug, link = null }) {
  const { status, products, error, ensure, reload } = useCatalog()
  const go = useNav((state) => state.go)

  useEffect(() => {
    ensure()
  }, [ensure])

  const product = productBySlug(products, slug)

  if (status === 'error') {
    return (
      <div className={s.center}>
        <EmptyState
          icon={WarningCircle}
          title="We could not load the checkout"
          action={<Button onClick={reload}>Try again</Button>}
        >
          {error}
        </EmptyState>
      </div>
    )
  }
  if (status !== 'ready') {
    return (
      <div className={s.page}>
        <div className={s.summary}>
          <div className={s.summaryInner}>
            <Skeleton height={20} width="50%" />
            <Skeleton height={72} />
            <Skeleton height={56} width="60%" />
          </div>
        </div>
        <div className={s.main}>
          <div className={s.mainInner}>
            <Skeleton height={380} radius={16} />
          </div>
        </div>
      </div>
    )
  }
  if (!product) {
    return (
      <div className={s.center}>
        <EmptyState
          icon={WarningCircle}
          title="We could not find that course"
          action={<Button onClick={() => go('buyer', 'home')}>Back to courses</Button>}
        >
          It may have been removed.
        </EmptyState>
      </div>
    )
  }

  /* A new course starts a new checkout. */
  return <Flow key={product.id} product={product} link={link} />
}
