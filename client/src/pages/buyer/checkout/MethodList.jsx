/* The payment methods of the chosen country, as a list of choices. When Method Match has an answer, one list in its order
   puts the method most likely to succeed first and says why. Otherwise local methods come first, then card and PayPal.
   A method that is a simulation says so on its row, and one that runs in the PayPal sandbox says that. A method that is
   not connected yet is shown, but cannot be chosen. */
import { Bank, CreditCard, DeviceMobile, Hash, Ticket, Wallet } from '@phosphor-icons/react'
import { cx } from '@/lib/cx.js'
import s from './Checkout.module.css'

/* PayPal's logo is not used anywhere in this project, so PayPal is a wallet icon with its name. */
const ICONS = {
  mobile_money: DeviceMobile,
  bank_transfer: Bank,
  ussd: Hash,
  voucher: Ticket,
  card: CreditCard,
  paypal: Wallet,
}

function Row({ method, selected, ready, best, onChoose }) {
  const Icon = ICONS[method.kind] ?? CreditCard
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={!ready || undefined}
      className={cx(s.method, selected && s.selected, !ready && s.unavailable)}
      onClick={() => ready && onChoose(method.id)}
    >
      <span className={s.methodIcon}>
        <Icon size={22} weight={selected ? 'fill' : 'regular'} aria-hidden />
      </span>
      <span className={s.methodText}>
        <span className={s.methodLabel}>{method.label}</span>
        <span className={s.methodHint}>{method.hint}</span>
        {best && <span className={s.matchNote}>{method.match.reason}</span>}
      </span>
      {best && <span className={s.best}>Best match</span>}
      {method.simulated && <span className={s.tag}>Simulated</span>}
      {!method.simulated && ready && <span className={s.tag}>Sandbox</span>}
      {!ready && <span className={s.tag}>Soon</span>}
      <span className={s.radio} aria-hidden />
    </button>
  )
}

/* bestId: the first method in Method Match's order that can be used now. */
export default function MethodList({ methods, selectedId, onChoose, ready, bestId = null }) {
  const row = (method) => (
    <Row
      key={method.id}
      method={method}
      selected={method.id === selectedId}
      ready={ready(method)}
      best={method.id === bestId}
      onChoose={onChoose}
    />
  )

  if (methods.some((method) => method.match)) {
    return (
      <div className={s.methods} role="radiogroup" aria-label="Payment method">
        <p className={s.groupLabel}>Best match first</p>
        {methods.map(row)}
        <p className={s.matchBasis}>
          Method Match puts the method most likely to succeed in your country first, from how payments ended in the last
          30 days. Demo data.
        </p>
      </div>
    )
  }

  const local = methods.filter((method) => method.simulated)
  const global = methods.filter((method) => !method.simulated)

  return (
    <div className={s.methods} role="radiogroup" aria-label="Payment method">
      {local.length > 0 && <p className={s.groupLabel}>Pay locally</p>}
      {local.map(row)}
      {global.length > 0 && <p className={s.groupLabel}>Card and PayPal</p>}
      {global.map(row)}
    </div>
  )
}
