import { useCallback, useEffect, useState } from 'react'
import { getHealth } from '@/api/health.js'

/* The API's own report of itself: { status: 'loading' | 'ready' | 'error', data, error, retry }. */
export function useHealth() {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    getHealth({ signal: controller.signal }).then(
      (data) => setState({ status: 'ready', data }),
      (error) => {
        if (!controller.signal.aborted) setState({ status: 'error', error })
      },
    )
    return () => controller.abort()
  }, [attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((count) => count + 1)
  }, [])

  return { ...state, retry }
}
