import { useEffect, useState } from 'react'

/* The current time, refreshed every `every` milliseconds, so "5 min ago" stays true while a page is open. */
export function useNow(every = 60_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every)
    return () => clearInterval(timer)
  }, [every])
  return now
}
