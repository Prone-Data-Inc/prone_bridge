/* When a payment link can be used. One definition, so the seller's list, the buyer's page and the checkout all agree.
     paused   the seller switched it off
     expired  its end date has passed
     full     it has been paid as many times as the seller allowed
     active   anyone with the link can pay */
export function linkState({ active, expiresAt, maxUses, paid }, now = new Date()) {
  if (!active) return 'paused'
  if (expiresAt && new Date(expiresAt).getTime() <= now.getTime()) return 'expired'
  if (maxUses != null && paid >= maxUses) return 'full'
  return 'active'
}

/* What a buyer is told when a link cannot be used. */
export const LINK_REASONS = {
  paused: 'The seller has paused this link.',
  expired: 'This link has expired.',
  full: 'This link has reached its limit.',
}
