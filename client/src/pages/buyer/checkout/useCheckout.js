/* The logic of the checkout, kept out of the screens: which country and method are chosen, what the price is, and the
   payment itself, from pressing Pay to the answer. phase moves through
     form -> creating -> waiting -> paid | failed          local (simulated) methods
     form -> confirming -> paid | failed | pending          card and PayPal, through the PayPal sandbox
   Nothing here decides a price: the server works out the amounts, this only shows them.
   The PayPal rail never leaves the form while the buyer is paying: PayPal's window and its card fields are drawn into
   this page and must stay there until the buyer has approved. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { changeSessionCountry, createPayment, settleSimulated, startSession } from '@/api/checkout.js'
import { cancelPayment, capturePayment } from '@/api/paypal.js'
import { toLocalMinor } from '#shared/money.js'
import { useCatalog } from '@/stores/catalog.js'
import { useLearner } from '@/stores/learner.js'
import { useNotifications } from '@/stores/notifications.js'
import { usePaypal } from '@/stores/paypal.js'
import { useSession } from '@/stores/session.js'
import { freshSuffix, personaFor } from './personas.js'
import { testPhone, timing } from './simulation.js'

const COUNTRY_KEY = 'pb.country'
const DEFAULT_COUNTRY = 'CI'

const storedCountry = () => {
  try {
    return window.localStorage.getItem(COUNTRY_KEY) || DEFAULT_COUNTRY
  } catch {
    return DEFAULT_COUNTRY
  }
}

const remember = (code) => {
  try {
    window.localStorage.setItem(COUNTRY_KEY, code)
  } catch {
    /* private mode */
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)

const problemFrom = (error) => ({
  code: error.code ?? 'error',
  status: error.status,
  message: error.message,
  fields: error.details,
})

/* Where a finished payment goes next. Anything PayPal still holds is pending. */
const phaseFor = (status) => (status === 'succeeded' ? 'paid' : status === 'failed' ? 'failed' : 'pending')

export function useCheckout(product) {
  const countries = useCatalog((state) => state.countries)
  const buyer = useSession((state) => state.buyer)
  const paypalOn = usePaypal((state) => state.available)
  const [country, setCountryCode] = useState(storedCountry)
  const [methodId, setMethodId] = useState(null)
  const [outcome, setOutcome] = useState('approve')
  const [contact, setContact] = useState(() =>
    buyer ? { name: buyer.name ?? '', email: buyer.email ?? '' } : personaFor(storedCountry()),
  )
  const [touched, setTouched] = useState(Boolean(buyer))
  const [phone, setPhone] = useState('')
  const [phase, setPhase] = useState('form')
  const [payment, setPayment] = useState(null)
  const [problem, setProblem] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const key = useRef(crypto.randomUUID())
  const started = useRef(false)
  /* The PayPal payment in progress: { paymentId, orderId }. */
  const open = useRef(null)

  /* The country in use: the chosen one if the seller serves it, otherwise the first one served. */
  const place = useMemo(
    () => countries.find((entry) => entry.code === country) ?? countries[0] ?? null,
    [countries, country],
  )
  const methods = place?.methods ?? []

  /* A method can be chosen when it is a simulation, or when it goes through PayPal and PayPal is connected. */
  const ready = useCallback((entry) => entry.simulated || (entry.provider === 'paypal' && paypalOn), [paypalOn])
  const method = methods.find((entry) => entry.id === methodId && ready(entry)) ?? methods.find(ready) ?? null
  const viaPaypal = Boolean(method && !method.simulated)

  /* What the buyer pays, in the currency they pay it in. Local methods use the local price. Card and PayPal charge in
     US dollars, because PayPal takes no African currency. The server works out the same number again. */
  const price = useMemo(() => {
    if (!place || !product) return null
    if (viaPaypal) return { currency: 'USD', minorUnits: 2, amount: product.priceUsdCents }
    return {
      currency: place.currency,
      minorUnits: place.minorUnits,
      amount: toLocalMinor(product.priceUsdCents, {
        fxPerUsd: place.fxPerUsd,
        minorUnits: place.minorUnits,
        priceStep: place.priceStep,
      }),
    }
  }, [place, product, viaPaypal])

  const phoneNumber = phone || testPhone(place?.dialCode)

  useEffect(() => {
    usePaypal.getState().ensure()
  }, [])

  /* The visit starts once the course and the countries are known. It only feeds the seller's numbers. */
  useEffect(() => {
    if (started.current || !product || !place) return
    started.current = true
    startSession({ product: product.slug, country: place.code }).then(
      (session) => setSessionId(session.id),
      () => {},
    )
  }, [product, place])

  const chooseCountry = useCallback(
    (code) => {
      setCountryCode(code)
      remember(code)
      setPhone('')
      setProblem(null)
      if (!touched) setContact(personaFor(code))
      if (sessionId) changeSessionCountry(sessionId, code).catch(() => {})
    },
    [sessionId, touched],
  )

  /* A new method starts from approving: the demo control of the last one does not carry over. */
  const chooseMethod = useCallback((id) => {
    setMethodId(id)
    setOutcome('approve')
    setProblem(null)
  }, [])

  const editContact = useCallback((change) => {
    setTouched(true)
    setContact((current) => ({ ...current, ...change }))
  }, [])

  /* Another take of the demo: the same person, a different buyer, so they can buy the same course again. */
  const useNewBuyer = useCallback(() => {
    setContact(personaFor(place?.code ?? DEFAULT_COUNTRY, freshSuffix()))
    setTouched(true)
    setProblem(null)
  }, [place])

  const valid = Boolean(method && contact.name.trim().length >= 2 && looksLikeEmail(contact.email.trim()))

  const requestBody = useCallback(
    () => ({
      idempotencyKey: key.current,
      product: product.slug,
      country: place.code,
      method: method.id,
      sessionId: sessionId ?? undefined,
      buyer: { name: contact.name.trim(), email: contact.email.trim() },
    }),
    [product, place, method, sessionId, contact],
  )

  /* The buyer is now known: their messages and their courses come with them. */
  const rememberBuyer = useCallback(
    (id) => useSession.getState().setBuyer({ id, name: contact.name.trim(), email: contact.email.trim() }),
    [contact],
  )

  /* A payment is over: show how it ended, and bring in the notification and the unlocked course. */
  const finalize = useCallback(async (settled) => {
    setPayment(settled)
    if (settled.status === 'succeeded' || settled.status === 'failed') key.current = crypto.randomUUID()
    setPhase(phaseFor(settled.status))
    await Promise.all([useNotifications.getState().refresh('buyer'), useLearner.getState().load()])
  }, [])

  /* Local methods: create the payment, wait for the simulated provider, then settle it the way the demo control says. */
  const pay = useCallback(async () => {
    if (!valid || viaPaypal || phase !== 'form') return
    setProblem(null)
    setPhase('creating')
    try {
      const { payment: created } = await createPayment(requestBody())
      setPayment(created)
      rememberBuyer(created.buyer.id)
      setPhase('waiting')

      await sleep(timing.waitMs)
      const { payment: settled } = await settleSimulated(created.id, outcome)
      await finalize(settled)
    } catch (error) {
      /* A refusal means this request is settled: the next attempt is a new one, with its own key. */
      if (error.status === 409) key.current = crypto.randomUUID()
      setPhase('form')
      setProblem(problemFrom(error))
    }
  }, [valid, viaPaypal, phase, requestBody, rememberBuyer, outcome, finalize])

  /* Card and PayPal, step one: make the payment and its PayPal order. Answers { paymentId, orderId }, or null when the
     payment turned out to be over already. The form stays as it is. A failure is shown, then thrown to PayPal's SDK. */
  const begin = useCallback(async () => {
    setProblem(null)
    try {
      const { payment: created, paypal } = await createPayment(requestBody())
      setPayment(created)
      rememberBuyer(created.buyer.id)
      if (!paypal) {
        await finalize(created)
        return null
      }
      open.current = { paymentId: created.id, orderId: paypal.orderId }
      return open.current
    } catch (error) {
      if (error.status === 409 || error.status >= 500) key.current = crypto.randomUUID()
      setProblem(problemFrom(error))
      error.reported = true
      throw error
    }
  }, [requestBody, rememberBuyer, finalize])

  /* Step two, once the buyer has approved in PayPal's window or the card fields: the server takes the money. If that
     cannot be confirmed, the order is kept, so the same capture can be asked for again and money is never taken twice. */
  const finish = useCallback(
    async (orderId) => {
      const current = open.current
      if (!current || current.orderId !== orderId) return
      setPhase('confirming')
      try {
        const { payment: settled } = await capturePayment(
          current.paymentId,
          orderId,
          outcome === 'decline' ? 'decline' : 'approve',
        )
        open.current = null
        await finalize(settled)
      } catch (error) {
        setPhase('form')
        setProblem({ ...problemFrom(error), retry: true })
      }
    },
    [outcome, finalize],
  )

  const retryCapture = useCallback(() => {
    if (open.current) finish(open.current.orderId)
  }, [finish])

  /* The buyer closed PayPal's window: nothing was taken. Back to the form, with a fresh request for next time. */
  const abandon = useCallback(() => {
    const current = open.current
    open.current = null
    if (current) cancelPayment(current.paymentId).catch(() => {})
    key.current = crypto.randomUUID()
    setPayment(null)
    setProblem(null)
    setPhase('form')
  }, [])

  /* Something went wrong inside PayPal's window. A problem already shown from begin() is not shown twice. */
  const fail = useCallback((error) => {
    if (error?.reported || error?.message === 'finished') return
    setProblem({ code: 'paypal_error', message: 'PayPal could not complete that. Try again.' })
  }, [])

  const explain = useCallback((message) => setProblem({ code: 'check', message }), [])

  /* After a failed payment: back to the form with everything kept, ready for another attempt. The demo control goes
     back to approving, since a retry is meant to go well. */
  const tryAgain = useCallback(() => {
    setPayment(null)
    setProblem(null)
    setOutcome('approve')
    setPhase('form')
  }, [])

  return {
    country: place?.code ?? country,
    place,
    methods,
    method,
    ready,
    viaPaypal,
    chooseCountry,
    chooseMethod,
    price,
    contact,
    editContact,
    useNewBuyer,
    phone: phoneNumber,
    setPhone,
    outcome,
    setOutcome,
    valid,
    phase,
    payment,
    problem,
    pay,
    begin,
    finish,
    retryCapture,
    abandon,
    fail,
    explain,
    tryAgain,
  }
}
