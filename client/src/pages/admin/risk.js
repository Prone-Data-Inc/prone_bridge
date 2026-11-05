/* How a risk rating reads and looks, in one place, so a badge, a table and a chart agree. */
export const RISK = {
  low: { label: 'Low', tone: 'success' },
  medium: { label: 'Medium', tone: 'warning' },
  high: { label: 'High', tone: 'danger' },
}

export const riskLabel = (level) => RISK[level]?.label ?? 'Not scored'
export const riskTone = (level) => RISK[level]?.tone ?? 'neutral'

/* The lines the rules draw: below medium a payment goes ahead, from medium a person reviews it, from high it is blocked. */
export const THRESHOLDS = { medium: 30, high: 60 }

export const DECISION_TEXT = {
  allow: 'Let through',
  review: 'Held for review',
  block: 'Blocked at once',
}

/* Who wrote the note a reviewer reads. */
export const SOURCE_TEXT = {
  ai: "Written by AI from the rules' findings",
  rules: 'Written by the rules',
}

/* The choices of the filters above the transactions table. */
export const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'succeeded', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: 'in_review', label: 'In review' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'processing', label: 'Processing' },
  { value: 'requires_payment', label: 'Awaiting payment' },
  { value: 'refunded', label: 'Refunded' },
]

export const LEVEL_OPTIONS = [
  { value: '', label: 'Any risk' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export const METHOD_OPTIONS = [
  { value: '', label: 'All methods' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'ussd', label: 'USSD' },
  { value: 'voucher', label: 'Cash voucher' },
  { value: 'card', label: 'Card' },
  { value: 'paypal', label: 'PayPal' },
]

export const CORRIDOR_STATUS = [
  { value: 'operational', label: 'Working' },
  { value: 'degraded', label: 'Slow' },
  { value: 'down', label: 'Down' },
]
