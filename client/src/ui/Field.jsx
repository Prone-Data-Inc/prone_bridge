/* Form pieces: Field (label, hint, error around a control), Input, Select and Toggle (a switch). */
import { useId } from 'react'
import { cx } from '@/lib/cx.js'
import s from './Field.module.css'

export function Field({ label, hint, error, children }) {
  const id = useId()
  return (
    <div className={s.field}>
      {label && (
        <label className={s.label} htmlFor={id}>
          {label}
        </label>
      )}
      {children(id, error ? `${id}-error` : hint ? `${id}-hint` : undefined)}
      {error ? (
        <p id={`${id}-error`} className={s.error} role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className={s.hint}>
            {hint}
          </p>
        )
      )}
    </div>
  )
}

export function Input({ label, hint, error, className, ...rest }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <input
          id={id}
          className={cx(s.control, error && s.invalid, className)}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
          {...rest}
        />
      )}
    </Field>
  )
}

export function Select({ label, hint, error, options, className, ...rest }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <select
          id={id}
          className={cx(s.control, s.select, error && s.invalid, className)}
          aria-describedby={describedBy}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={cx(s.toggle, disabled && s.disabled)}>
      <input
        type="checkbox"
        role="switch"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={s.track} aria-hidden>
        <span className={s.thumb} />
      </span>
      {label && <span>{label}</span>}
    </label>
  )
}
