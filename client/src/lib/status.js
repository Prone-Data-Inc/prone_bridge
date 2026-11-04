/* How each payment status reads and looks, in one place, so a table, a badge and a chart agree. */
export const PAYMENT_STATUS = {
  requires_payment: { label: 'Awaiting payment', tone: 'neutral' },
  processing: { label: 'Processing', tone: 'accent' },
  succeeded: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  blocked: { label: 'Blocked', tone: 'danger' },
  in_review: { label: 'In review', tone: 'warning' },
  refunded: { label: 'Refunded', tone: 'neutral' },
}

export const statusLabel = (status) => PAYMENT_STATUS[status]?.label ?? status
export const statusTone = (status) => PAYMENT_STATUS[status]?.tone ?? 'neutral'
