/* Human-friendly ids and names for payments and messages. */
import { randomInt } from 'node:crypto'

/* No 0, 1, I, L or O, so a reference read out loud or copied by hand is never misread. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

/* pb_7K3M9QX2TD4R: the id a buyer and a seller both see on a payment. */
export function reference(prefix = 'pb', length = 12) {
  return `${prefix}_${Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`
}

const LINK_ALPHABET = 'abcdefghjkmnpqrstvwxyz23456789'

/* k7m3q9x2: the short code in a payment link. Lowercase, with no look-alike letters, so it survives being read aloud. */
export const linkCode = (length = 8) =>
  Array.from({ length }, () => LINK_ALPHABET[randomInt(LINK_ALPHABET.length)]).join('')

/* "Aminata Diallo" -> "Aminata D." for messages that mention a buyer. */
export function shortName(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length < 2) return words[0] ?? 'A buyer'
  return `${words[0]} ${words.at(-1)[0].toUpperCase()}.`
}
