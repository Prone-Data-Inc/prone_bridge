/* A floating layer (menus, the notification panel) drawn in a portal on document.body, so no list or scroll container can
   clip it. It sits under its anchor, aligned to the anchor's right or left edge, flips above when there is no room
   below, stays inside the viewport and follows the anchor on scroll and resize. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDismiss } from '@/hooks/useDismiss.js'

const GAP = 6
const MARGIN = 8

function place(anchor, panel, align) {
  const rect = anchor.getBoundingClientRect()
  const { width, height } = panel.getBoundingClientRect()
  const below = rect.bottom + GAP + height <= window.innerHeight - MARGIN || rect.top - GAP - height < MARGIN
  const left = align === 'left' ? rect.left : rect.right - width
  return {
    top: below ? rect.bottom + GAP : rect.top - GAP - height,
    left: Math.min(Math.max(MARGIN, left), window.innerWidth - width - MARGIN),
    origin: below ? 'top' : 'bottom',
  }
}

function Floating({ anchorRef, panelRef, align = 'right', className, children, ...rest }) {
  const [position, setPosition] = useState(null)

  useLayoutEffect(() => {
    const update = () =>
      anchorRef.current && panelRef.current && setPosition(place(anchorRef.current, panelRef.current, align))
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [anchorRef, panelRef, align])

  return createPortal(
    <div
      ref={panelRef}
      className={className}
      data-origin={position?.origin}
      style={{
        position: 'fixed',
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? 'visible' : 'hidden',
        zIndex: 'var(--z-menu)',
      }}
      {...rest}
    >
      {children}
    </div>,
    document.body,
  )
}

/* A Floating layer that closes on outside click and on Escape. Give it the element it hangs from. */
export function Popover({ anchorRef, open, onClose, align, className, children, ...rest }) {
  const panel = useRef(null)
  const refs = useMemo(() => [anchorRef, panel], [anchorRef])
  useDismiss(refs, open, onClose)

  /* Keyboard users land inside the panel, and Escape returns them to the button. */
  useEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    return () => anchor?.querySelector('button')?.focus?.()
  }, [open, anchorRef])

  if (!open) return null
  return (
    <Floating anchorRef={anchorRef} panelRef={panel} align={align} className={className} {...rest}>
      {children}
    </Floating>
  )
}

export default Floating
