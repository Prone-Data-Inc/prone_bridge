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
