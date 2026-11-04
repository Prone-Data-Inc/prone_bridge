/* Why a payment can fail, in words a buyer can act on. The codes are the ones stored on a payment (failure_code), so the
   API, the notifications and the screens all say the same thing. */
export const FAILURES = {
  approval_timeout: 'The request on your phone expired.',
  insufficient_funds: 'The balance was too low.',
  limit_exceeded: 'That amount is above your limit.',
  card_declined: 'The card was declined.',
  authentication_failed: 'The card could not be verified.',
  transfer_not_received: 'We did not receive the transfer.',
  session_expired: 'The session expired.',
  voucher_expired: 'The voucher expired.',
  payer_cancelled: 'The payment was cancelled.',
}

export const failureMessage = (code) => FAILURES[code] ?? 'The payment did not go through.'
