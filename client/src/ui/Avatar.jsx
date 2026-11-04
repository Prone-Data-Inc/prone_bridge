/* Initials on a soft color picked from the name, so the same person always looks the same. */
import { cx } from '@/lib/cx.js'
import { initials } from '@/lib/format.js'
import s from './Avatar.module.css'

const TONES = ['one', 'two', 'three', 'four']

const toneOf = (name) => TONES[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % TONES.length]

export default function Avatar({ name = '', size = 28, className }) {
  return (
    <span
      className={cx(s.avatar, s[toneOf(name)], className)}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}
