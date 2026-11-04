/* Switcher between a few options. variant 'pill' is a boxed control, 'text' is plain tabs. Arrow keys move the choice. */
import { cx } from '@/lib/cx.js'
import s from './Segmented.module.css'

export default function Segmented({ options, value, onChange, variant = 'pill', label }) {
  const move = (event, index) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    if (!step) return
    event.preventDefault()
    const next = options[(index + step + options.length) % options.length]
    onChange(next.value)
    event.currentTarget.parentElement.querySelector(`[data-value="${next.value}"]`)?.focus()
  }

  return (
    <div className={cx(s.group, s[variant])} role="radiogroup" aria-label={label}>
      {options.map(({ value: optionValue, label: text, icon: Icon }, index) => {
        const selected = optionValue === value
        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            data-value={optionValue}
            className={cx(s.item, selected && s.selected)}
            onClick={() => onChange(optionValue)}
            onKeyDown={(event) => move(event, index)}
          >
            {Icon && <Icon size={16} aria-hidden />}
            {text}
          </button>
        )
      })}
    </div>
  )
}
