/* The PayPal button, from PayPal's SDK v6. PayPal draws the button and opens its own window to approve the payment. We
   make the order when it is pressed (never before, and never with a price from the browser), and the server takes the
   money once PayPal says the buyer approved. */
import { useEffect, useRef, useState } from 'react'
import { paypalInstance } from '@/lib/paypalSdk.js'
import { Skeleton } from '@/ui/States.jsx'
import s from './Checkout.module.css'

export default function PaypalPay({ checkout }) {
  const slot = useRef(null)
  /* PayPal keeps the callbacks it was given, so they read the latest checkout through this ref. */
  const latest = useRef(checkout)
  const [state, setState] = useState('loading')

  useEffect(() => {
    latest.current = checkout
  })

  useEffect(() => {
    let cancelled = false
    let button = null

    ;(async () => {
      try {
        const sdk = await paypalInstance('paypal-payments')
        const eligible = (await sdk.findEligibleMethods()).isEligible('paypal')
        if (cancelled) return
        if (!eligible) return setState('unavailable')

        const session = await sdk.createPayPalOneTimePaymentSession({
          onApprove: ({ orderId }) => latest.current.finish(orderId),
          onCancel: () => latest.current.abandon(),
          onError: (error) => latest.current.fail(error),
        })
        if (cancelled) return

        button = document.createElement('paypal-button')
        button.addEventListener('click', async () => {
          const now = latest.current
          if (!now.valid) return now.explain('Enter your name and a valid email first.')
          try {
            /* Not awaited here: PayPal wants the window opened by the click itself, and the order made as it opens. */
            const order = now.begin().then((started) => {
              if (!started) throw new Error('finished')
              return { orderId: started.orderId }
            })
            await session.start({ presentationMode: 'auto' }, order)
          } catch (error) {
            latest.current.fail(error)
          }
        })
        slot.current.append(button)
        setState('ready')
      } catch {
        if (!cancelled) setState('error')
      }
    })()

    return () => {
      cancelled = true
      button?.remove()
    }
  }, [])

  return (
    <div className={s.paypal}>
      <div ref={slot} className={s.paypalSlot} hidden={state !== 'ready'} />
      {state === 'loading' && <Skeleton height={48} radius={8} />}
      {state === 'unavailable' && <p className={s.cardNote}>PayPal is not available here. Choose another method.</p>}
      {state === 'error' && <p className={s.cardNote}>We could not load PayPal. Reload the page to try again.</p>}
    </div>
  )
}
