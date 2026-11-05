/* Formatters the seller pages share: dollars, days and dates. Money arrives as integer US cents. */
import { compact, formatNumber } from '@/lib/format.js'
import { formatUsd } from '#shared/money.js'

export const RANGES = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
]

export const usd = (cents) => formatUsd(cents)

/* Axis and tooltip text for dollars: $412, $12,125, $48K. */
export const dollars = (value) => (value >= 100_000 ? `$${compact(value)}` : `$${formatNumber(Math.round(value))}`)

/* 2026-10-06 -> Oct 6 */
export const dayLabel = (day) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export const shortDate = (value) =>
  new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export const dateTime = (value) =>
  new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/* A change as a fraction, or undefined when there is nothing to compare with (the stat card then shows no arrow). */
export const deltaOf = (metric) => metric.delta ?? undefined
