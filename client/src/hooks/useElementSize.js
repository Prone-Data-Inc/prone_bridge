/* Tracks an element's content width with ResizeObserver, so charts draw at their real pixel size. */
import { useLayoutEffect, useRef, useState } from 'react'

export function useElementSize() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}
