/* Draws the toast stack. Mount once, near the root. */
import { CheckCircle, Info, Warning, WarningCircle, X } from '@phosphor-icons/react'
import { cx } from '@/lib/cx.js'
import { useToasts } from '@/stores/toasts.js'
import s from './Toasts.module.css'

const ICONS = { neutral: Info, success: CheckCircle, warning: Warning, danger: WarningCircle }

export default function Toasts() {
  const items = useToasts((state) => state.items)
  const dismiss = useToasts((state) => state.dismiss)

  return (
    <div className={s.stack} role="region" aria-label="Notifications" aria-live="polite">
      {items.map(({ id, tone, eyebrow, title, message, onClick }) => {
        const Icon = ICONS[tone] ?? Info
        const content = (
          <>
            <Icon size={20} weight="fill" className={cx(s.icon, s[tone])} aria-hidden />
            <span className={s.text}>
              {eyebrow && <span className={s.eyebrow}>{eyebrow}</span>}
              {title && <strong className={s.title}>{title}</strong>}
              <span>{message}</span>
            </span>
          </>
        )
        return (
          <div key={id} className={s.toast}>
            {onClick ? (
              <button
                type="button"
                className={s.main}
                onClick={() => {
                  onClick()
                  dismiss(id)
                }}
              >
                {content}
              </button>
            ) : (
              <div className={s.main}>{content}</div>
            )}
            <button type="button" className={s.close} aria-label="Dismiss" onClick={() => dismiss(id)}>
              <X size={14} weight="bold" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
