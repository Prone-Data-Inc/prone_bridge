/* Made-up buyers to prefill the checkout, one per country, so a demo is one click. Nothing here is a real person, and the
   addresses end in example.com, which cannot receive mail. */
const NAMES = {
  CI: ['Aminata', 'Koné'],
  SN: ['Moussa', 'Ndiaye'],
  CM: ['Estelle', 'Mbarga'],
  GN: ['Mamadou', 'Bah'],
  ML: ['Awa', 'Traoré'],
  NG: ['Chidi', 'Okafor'],
  GH: ['Kofi', 'Mensah'],
  KE: ['Wanjiru', 'Kamau'],
  ZA: ['Thabo', 'Nkosi'],
  MA: ['Youssef', 'Benali'],
}

const plain = (text) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

/* { name, email } for a country. A suffix makes a different buyer of the same person, for another take. */
export function personaFor(country, suffix = '') {
  const [first, last] = NAMES[country] ?? NAMES.CI
  return { name: `${first} ${last}`, email: `${plain(first)}.${plain(last)}${suffix}@example.com` }
}

export const freshSuffix = () => String(Math.floor(1000 + Math.random() * 9000))

/* Every browser is its own demo buyer. Without this, each visitor would start as the very same person (the same email),
   and the first one to buy a course would make it look "already bought" for everyone after. The suffix is remembered in
   this browser, so the buyer stays the same person across countries and visits. */
const SUFFIX_KEY = 'pb.persona'
/* Only used when the browser refuses to store anything. */
let kept = null

function readSuffix() {
  try {
    const value = window.localStorage.getItem(SUFFIX_KEY)
    return /^\d{4}$/.test(value) ? value : kept
  } catch {
    return kept
  }
}

function writeSuffix(value) {
  try {
    window.localStorage.setItem(SUFFIX_KEY, value)
    kept = null
  } catch {
    /* private mode: it lasts for this visit only */
    kept = value
  }
}

export function browserSuffix() {
  const current = readSuffix()
  if (current) return current
  const made = freshSuffix()
  writeSuffix(made)
  return made
}

/* A different person for this browser from now on. */
export function rotateBrowserSuffix() {
  const made = freshSuffix()
  writeSuffix(made)
  return made
}

/* The buyer to prefill for a country: that country's made-up person, as this browser's own buyer. */
export const demoBuyerFor = (country) => personaFor(country, browserSuffix())
