/* Calls onDismiss on a click outside `refs` (one ref or several, such as a button and its floating menu) or on Escape,
   while `active` is true. */
import { useEffect } from 'react'

export function useDismiss(refs, active, onDismiss) {
  useEffect(() => {
    if (!active) return
    const list = Array.isArray(refs) ? refs : [refs]
    const onPointer = (event) => list.every((ref) => !ref.current?.contains(event.target)) && onDismiss()
    const onKey = (event) => event.key === 'Escape' && onDismiss()
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [refs, active, onDismiss])
}
