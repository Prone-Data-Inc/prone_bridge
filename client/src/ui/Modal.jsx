/* Dialog on a dimmed backdrop. Focus moves inside, Tab stays inside, Escape and a click outside close it, and focus
   goes back to where it was. size: sm, md or lg. */
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from '@phosphor-icons/react'
import { cx } from '@/lib/cx.js'
import { IconButton } from './Button.jsx'
import s from './Modal.module.css'

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/* The focusable elements of a dialog in page order, whatever order the browser lists them in. */
const focusables = (root) =>
  [...root.querySelectorAll(FOCUSABLE)].sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
  )

export default function Modal({ open, title, onClose, footer, size = 'md', children }) {
  const titleId = useId()
  const dialog = useRef(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    focusables(dialog.current)[0]?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') return onClose()
      if (event.key !== 'Tab') return
      const nodes = focusables(dialog.current)
      if (!nodes.length) return
      const first = nodes[0]
      const last = nodes.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className={s.scrim} onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={dialog} className={cx(s.dialog, s[size])} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className={s.header}>
          <h2 id={titleId} className={s.title}>
            {title}
          </h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </header>
        <div className={s.body}>{children}</div>
        {footer && <footer className={s.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
