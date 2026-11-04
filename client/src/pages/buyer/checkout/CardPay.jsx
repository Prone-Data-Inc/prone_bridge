/* Card payment, with PayPal's hosted card fields (SDK v6). The three inputs are PayPal's own, drawn into this page: the
   card number, the date and the code go to PayPal and never pass through this app or its server. We make the order when
   Pay is pressed, PayPal checks the card (and runs 3D Secure when the bank asks), then the server takes the money. */
import { useEffect, useRef, useState } from 'react'
import { paypalInstance } from '@/lib/paypalSdk.js'
import { Button } from '@/ui/Button.jsx'
import { Skeleton } from '@/ui/States.jsx'
import s from './Checkout.module.css'

/* PayPal's inputs take a text color and size but no background: they are white in both themes. So the text is always dark,
   and the box around them is white too. */
const FIELD_STYLE = { fontSize: '16px', color: '#0b1b3f', padding: '0 12px' }

export default function CardPay({ checkout, total }) {
  const number = useRef(null)
  const expiry = useRef(null)
  const cvv = useRef(null)
  const session = useRef(null)
  const latest = useRef(checkout)
  const [state, setState] = useState('loading')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  /* PayPal's eligibility answer for cards. It is advisory: PayPal says card fields may not appear in it, and they work
     without it, so the fields are always drawn and the real answer comes when the card is submitted. */
  const eligible = useRef(true)

  useEffect(() => {
    latest.current = checkout
  })

  useEffect(() => {
    let cancelled = false
    const slots = [number, expiry, cvv]

    ;(async () => {
      try {
        const sdk = await paypalInstance('card-fields')
        eligible.current = (await sdk.findEligibleMethods({ currencyCode: 'USD' })).isEligible('advanced_cards')
        if (cancelled) return

        session.current = sdk.createCardFieldsOneTimePaymentSession()
        const make = (type, placeholder) =>
          session.current.createCardFieldsComponent({ type, placeholder, style: FIELD_STYLE })
        number.current.replaceChildren(make('number', 'Card number'))
        expiry.current.replaceChildren(make('expiry', 'MM/YY'))
        cvv.current.replaceChildren(make('cvv', 'CVV'))
        setState('ready')
      } catch {
        if (!cancelled) setState('error')
      }
    })()

    return () => {
      cancelled = true
      session.current = null
      for (const slot of slots) slot.current?.replaceChildren()
    }
  }, [attempt])

  async function pay() {
    const now = latest.current
    if (!now.valid) return now.explain('Enter your name and a valid email first.')
    setBusy(true)
    try {
      const started = await now.begin()
      if (!started) return
      const { state: result } = await session.current.submit(started.orderId, {})
      if (result === 'succeeded') await latest.current.finish(started.orderId)
      else if (result === 'canceled') latest.current.abandon()
      else if (eligible.current)
        latest.current.explain('The card could not be checked. Check the details and try again.')
      else
        latest.current.explain(
          'PayPal did not accept the card. If the details are right, card payments may not be switched on for this PayPal sandbox account.',
        )
    } catch (error) {
      latest.current.fail(error)
    } finally {
      setBusy(false)
    }
  }

  const ready = state === 'ready'

  return (
    <div className={s.card}>
      <div hidden={!ready} className={s.cardFields}>
        <div className={s.cardRow}>
          <p className={s.cardLabel}>Card number</p>
          <div ref={number} className={s.cardField} />
        </div>
        <div className={s.cardPair}>
          <div className={s.cardRow}>
            <p className={s.cardLabel}>Expiry</p>
            <div ref={expiry} className={s.cardField} />
          </div>
          <div className={s.cardRow}>
            <p className={s.cardLabel}>Security code</p>
            <div ref={cvv} className={s.cardField} />
          </div>
        </div>
      </div>

      {state === 'loading' && (
        <div className={s.cardFields}>
          <Skeleton height={44} radius={8} />
          <Skeleton height={44} radius={8} />
        </div>
      )}
      {state === 'error' && (
        <p className={s.cardNote}>
          We could not load the card fields.{' '}
          <button
            type="button"
            className={s.linkButton}
            onClick={() => {
              setState('loading')
              setAttempt((count) => count + 1)
            }}
          >
            Try again
          </button>
        </p>
      )}

      <Button
        type="button"
        variant="primary"
        size="lg"
        className={s.payButton}
        disabled={!ready || !checkout.valid || busy}
        onClick={pay}
      >
        {total ? `Pay ${total}` : 'Pay'}
      </Button>
    </div>
  )
}
