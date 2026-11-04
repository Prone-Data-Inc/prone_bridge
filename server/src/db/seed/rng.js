/* A small seeded random generator (mulberry32). The same seed always gives the same demo data, so the seed is
   reproducible and testable. */
const hash = (text) => {
  let h = 1779033703 ^ text.length
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

const BASE32 = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

export function createRng(seed) {
  let state = hash(String(seed))

  const next = () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const rng = {
    next,
    /* Whole number from min to max, both included. */
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    pick: (items) => items[Math.floor(next() * items.length)],
    /* One item, chosen with a weight each. Items with a weight of 0 are never chosen. */
    weighted(items, weightOf) {
      const weights = items.map(weightOf)
      const total = weights.reduce((sum, weight) => sum + weight, 0)
      if (!(total > 0)) throw new Error('weighted() needs at least one positive weight')
      let point = next() * total
      for (let i = 0; i < items.length; i++) {
        point -= weights[i]
        if (point < 0) return items[i]
      }
      return items[items.length - 1]
    },
    /* Roughly normal, mean 0, spread 1 (Box-Muller). */
    gauss() {
      const u = 1 - next()
      const v = next()
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    },
    token: (length) => Array.from({ length }, () => BASE32[Math.floor(next() * BASE32.length)]).join(''),
    digits: (length) => Array.from({ length }, () => Math.floor(next() * 10)).join(''),
    uuid() {
      const bytes = Array.from({ length: 16 }, () => Math.floor(next() * 256))
      bytes[6] = (bytes[6] & 0x0f) | 0x40
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    },
  }
  return rng
}
