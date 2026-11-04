/* Money in one place, used by the API, the seed and the web app, so a price is the same everywhere.
   Amounts are integers: US cents for the seller's price, and minor units (kobo, cents, none for CFA) for local prices.
   Exchange rates are simulated and indicative. */

/* The local price of a US dollar amount, rounded to the country's tidy step. country: { fxPerUsd, minorUnits, priceStep } */
export function toLocalMinor(usdCents, { fxPerUsd, minorUnits, priceStep = 1 }) {
  const exact = (usdCents / 100) * fxPerUsd * 10 ** minorUnits
  return Math.round(exact / priceStep) * priceStep
}

/* ProneBridge's fee on a payment, in US cents. method: { feeBps, feeFixedCents } */
export function feeFor(amountCents, { feeBps, feeFixedCents = 0 }) {
  return Math.round((amountCents * feeBps) / 10_000) + feeFixedCents
}

export function formatUsd(cents, locale = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(cents / 100)
}

/* A local amount for display, such as "NGN 58,500.00" or "XOF 23,400". */
export function formatMinor(minor, { currency, minorUnits }, locale = 'en-US') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: minorUnits,
    maximumFractionDigits: minorUnits,
  })
    .format(minor / 10 ** minorUnits)
    .replace(/\p{Zs}/gu, ' ')
}
