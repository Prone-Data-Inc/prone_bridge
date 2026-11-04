/* A "more actions" button with a small menu. items: { label, icon, onClick, danger, disabled }, falsy items are skipped.
   Clicks inside a table row do not reach the row. */
import { useCallback, useRef, useState } from 'react'
import { DotsThree } from '@phosphor-icons/react'
import { cx } from '@/lib/cx.js'
import { IconButton } from './Button.jsx'
import { Popover } from './Floating.jsx'
import s from './Menu.module.css'

export default function Menu({ items, label = 'More' }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef(null)
  const close = useCallback(() => setOpen(false), [])
  const list = items.filter(Boolean)
  if (!list.length) return null

  return (
    <div ref={anchor} className={s.wrap} onClick={(event) => event.stopPropagation()}>
      <IconButton
        icon={DotsThree}
        weight="bold"
        label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      />
      <Popover anchorRef={anchor} open={open} onClose={close} className={s.menu} role="menu">
        {list.map(({ label: text, icon: Icon, onClick, danger, disabled }) => (
          <button
            key={text}
            type="button"
            role="menuitem"
            disabled={disabled}
            className={cx(s.item, danger && s.danger)}
            onClick={() => {
              close()
              onClick()
            }}
          >
            {Icon && <Icon size={16} aria-hidden />}
            {text}
          </button>
        ))}
      </Popover>
    </div>
  )
}
