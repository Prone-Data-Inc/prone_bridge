/* The payment methods of the chosen country, as a list of choices. Local methods come first, then card and PayPal. A method
   that is a simulation says so on its row, and one that runs in the PayPal sandbox says that. A method that is not
   connected yet is shown, but cannot be chosen. */
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

function Row({ method, selected, ready, onChoose }) {
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
      </span>
      {method.simulated && <span className={s.tag}>Simulated</span>}
      {!method.simulated && ready && <span className={s.tag}>Sandbox</span>}
      {!ready && <span className={s.tag}>Soon</span>}
      <span className={s.radio} aria-hidden />
    </button>
  )
}

export default function MethodList({ methods, selectedId, onChoose, ready }) {
  const local = methods.filter((method) => method.simulated)
  const global = methods.filter((method) => !method.simulated)

  return (
    <div className={s.methods} role="radiogroup" aria-label="Payment method">
      {local.length > 0 && <p className={s.groupLabel}>Pay locally</p>}
      {local.map((method) => (
        <Row
          key={method.id}
          method={method}
          selected={method.id === selectedId}
          ready={ready(method)}
          onChoose={onChoose}
        />
      ))}
      {global.length > 0 && <p className={s.groupLabel}>Card and PayPal</p>}
      {global.map((method) => (
        <Row
          key={method.id}
          method={method}
          selected={method.id === selectedId}
          ready={ready(method)}
          onChoose={onChoose}
        />
      ))}
    </div>
  )
}
