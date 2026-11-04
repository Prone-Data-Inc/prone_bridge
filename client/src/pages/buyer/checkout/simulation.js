/* What the simulated payment methods show a buyer: a test phone number, a short code, a voucher, bank details. None of it
   is real. It is derived from the payment reference, so the same payment always shows the same thing. */

export const OUTCOMES = [
  { value: 'approve', label: 'Approve' },
  { value: 'decline', label: 'Decline' },
  { value: 'timeout', label: 'Time out' },
]

/* How long the simulated provider takes to answer, in milliseconds. A test can set it to zero. */
export const timing = { waitMs: 3200 }

/* A made-up number for the country: its dial code and zeros. It cannot belong to anyone. */
export const testPhone = (dialCode = '') => `${dialCode} 07 00 00 00 00`.trim()

const digitsOf = (text, count) =>
  [...text.replace(/[^A-Z0-9]/g, '')]
    .slice(0, count)
    .map((char) => char.charCodeAt(0) % 10)
    .join('')

/* The things shown while a payment waits: { ussd, voucher, bank }. */
export function instructionsFor(reference) {
  const body = reference.replace(/^pb_/, '')
  return {
    ussd: `*384*${digitsOf(body, 4)}#`,
    voucher: `VC-${body.slice(0, 4)}-${body.slice(4, 8)}`,
    bank: { name: 'ProneBridge Collections', number: '0000 0000 00', reference },
  }
}
