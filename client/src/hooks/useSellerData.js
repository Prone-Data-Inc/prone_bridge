/* Loads what a seller page shows, and keeps it fresh. It loads again when `key` changes (pass the filters as a string),
   when a live signal says one of the seller's payments or payouts changed, and, when the live connection is not up, every
   thirty seconds. A reload keeps the old numbers on screen until the new ones arrive. A slow answer to an old request never
   replaces a newer one.
   Answers { status, data, error, reload }. status: 'loading' (first load), 'refreshing', 'ready' or 'error'. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { onSignal } from '@/realtime/bus.js'
import { useRealtime } from '@/stores/realtime.js'

const SIGNAL_DELAY_MS = 700
const FALLBACK_MS = 30_000
const DEFAULT_WATCH = ['payments', 'payouts']

/* watch: the tables whose change reloads the page. Pass a constant, not a new array on every render. */
export function useSellerData(load, key = '', { watch = DEFAULT_WATCH } = {}) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })
  const live = useRealtime((value) => value.status === 'live')
  const loader = useRef(load)
  const ticket = useRef(0)
  const merchantId = useRef(null)

  useEffect(() => {
    loader.current = load
  })

  /* quiet: reload without showing that it is happening (a live signal, the fallback timer). */
  const run = useCallback(async ({ quiet = false } = {}) => {
    const mine = ++ticket.current
    if (!quiet) setState((now) => ({ ...now, status: now.data ? 'refreshing' : 'loading', error: null }))
    try {
      const data = await loader.current()
      if (mine !== ticket.current) return
      merchantId.current = data?.merchant?.id ?? merchantId.current
      setState({ status: 'ready', data, error: null })
    } catch (error) {
      if (mine !== ticket.current || error?.name === 'AbortError') return
      setState((now) => ({ status: 'error', data: now.data, error: error.message }))
    }
  }, [])

  useEffect(() => {
    run()
  }, [run, key])

  useEffect(() => {
    let timer
    const stop = onSignal((signal) => {
      if (!watch.includes(signal.table)) return
      if (merchantId.current && signal.merchantId && signal.merchantId !== merchantId.current) return
      clearTimeout(timer)
      timer = setTimeout(() => run({ quiet: true }), SIGNAL_DELAY_MS)
    })
    return () => {
      stop()
      clearTimeout(timer)
    }
  }, [run, watch])

  useEffect(() => {
    if (live) return
    const timer = setInterval(() => run({ quiet: true }), FALLBACK_MS)
    return () => clearInterval(timer)
  }, [live, run])

  return { ...state, reload: run }
}
