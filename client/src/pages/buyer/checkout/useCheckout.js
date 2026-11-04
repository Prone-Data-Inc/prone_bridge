/* The logic of the checkout, kept out of the screens: which country and method are chosen, what the price is in that
   country, and the payment itself, from pressing Pay to the answer. phase moves through
     form -> creating -> waiting -> paid | failed
   Nothing here decides a price: the server works out the amounts, this only shows them. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { changeSessionCountry, createPayment, settleSimulated, startSession } from '@/api/checkout.js'
import { toLocalMinor } from '#shared/money.js'
import { useCatalog } from '@/stores/catalog.js'
import { useLearner } from '@/stores/learner.js'
import { useNotifications } from '@/stores/notifications.js'
import { useSession } from '@/stores/session.js'
import { freshSuffix, personaFor } from './personas.js'
import { testPhone, timing } from './simulation.js'

const COUNTRY_KEY = 'pb.country'
const DEFAULT_COUNTRY = 'CI'

/* Only the simulated methods can take a payment in this step. Card and PayPal join when they are connected. */
export const isReady = (method) => method.provider === 'simulated'

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

export function useCheckout(product) {
  const countries = useCatalog((state) => state.countries)
  const buyer = useSession((state) => state.buyer)
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

  /* The country in use: the chosen one if the seller serves it, otherwise the first one served. */
  const place = useMemo(
    () => countries.find((entry) => entry.code === country) ?? countries[0] ?? null,
    [countries, country],
  )
  const methods = place?.methods ?? []
  const method = methods.find((entry) => entry.id === methodId && isReady(entry)) ?? methods.find(isReady) ?? null

  /* The price in the buyer's currency. The server computes the same number again when it takes the payment. */
  const local = useMemo(
    () =>
      place && product
        ? toLocalMinor(product.priceUsdCents, {
            fxPerUsd: place.fxPerUsd,
            minorUnits: place.minorUnits,
            priceStep: place.priceStep,
          })
        : null,
    [place, product],
  )

  const phoneNumber = phone || testPhone(place?.dialCode)

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

  const pay = useCallback(async () => {
    if (!valid || phase !== 'form') return
    setProblem(null)
    setPhase('creating')
    try {
      const { payment: created } = await createPayment({
        idempotencyKey: key.current,
        product: product.slug,
        country: place.code,
        method: method.id,
        sessionId: sessionId ?? undefined,
        buyer: { name: contact.name.trim(), email: contact.email.trim() },
      })
      setPayment(created)
      /* The buyer is now known: their messages and their courses come with them. */
      useSession.getState().setBuyer({ id: created.buyer.id, name: contact.name.trim(), email: contact.email.trim() })
      setPhase('waiting')

      await sleep(timing.waitMs)
      const { payment: settled } = await settleSimulated(created.id, outcome)
      setPayment(settled)
      key.current = crypto.randomUUID()
      setPhase(settled.status === 'succeeded' ? 'paid' : 'failed')
      await Promise.all([useNotifications.getState().refresh('buyer'), useLearner.getState().load()])
    } catch (error) {
      /* A refusal means this request is settled: the next attempt is a new one, with its own key. */
      if (error.status === 409) key.current = crypto.randomUUID()
      setPhase('form')
      setProblem({ code: error.code ?? 'error', status: error.status, message: error.message, fields: error.details })
    }
  }, [valid, phase, product, place, method, sessionId, contact, outcome])

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
    chooseCountry,
    chooseMethod: setMethodId,
    local,
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
    tryAgain,
  }
}
