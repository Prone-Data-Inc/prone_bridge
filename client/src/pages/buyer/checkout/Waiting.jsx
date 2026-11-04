/* While the simulated provider answers: what the buyer would do on their phone, at their bank or at an agent, and a
   progress bar for the few seconds it takes. */
import { Bank, DeviceMobile, Hash, Ticket } from '@phosphor-icons/react'
import { formatMinor } from '#shared/money.js'
import { instructionsFor, timing } from './simulation.js'
import s from './Checkout.module.css'

export default function Waiting({ payment, place, phone }) {
  const codes = instructionsFor(payment.reference)
  const amount = formatMinor(payment.displayAmountMinor, {
    currency: payment.displayCurrency,
    minorUnits: place.minorUnits,
  })
  const kind = place.methods.find((method) => method.id === payment.method.id)?.kind

  const content = {
    mobile_money: {
      icon: DeviceMobile,
      title: 'Check your phone',
      text: `We sent a request to ${phone}. Approve it to pay ${amount}.`,
    },
    ussd: {
      icon: Hash,
      title: 'Dial this code',
      text: `Dial the code on your phone and follow the steps to pay ${amount}.`,
      code: codes.ussd,
    },
    bank_transfer: {
      icon: Bank,
      title: 'Pay from your bank',
      text: `Send ${amount} with this reference.`,
      bank: codes.bank,
    },
    voucher: {
      icon: Ticket,
      title: 'Pay at an agent',
      text: `Show this code and pay ${amount} in cash.`,
      code: codes.voucher,
    },
  }[kind]

  const Icon = content.icon

  return (
    <section className={s.waiting} aria-live="polite" aria-busy="true">
      <span className={s.pulse}>
        <Icon size={36} weight="duotone" aria-hidden />
      </span>
      <h2 className={s.stateTitle}>{content.title}</h2>
      <p className={s.stateText}>{content.text}</p>

      {content.code && <p className={s.code}>{content.code}</p>}
      {content.bank && (
        <dl className={s.bank}>
          <div>
            <dt>Account name</dt>
            <dd>{content.bank.name}</dd>
          </div>
          <div>
            <dt>Account number</dt>
            <dd>{content.bank.number}</dd>
          </div>
          <div>
            <dt>Reference</dt>
            <dd>{content.bank.reference}</dd>
          </div>
        </dl>
      )}

      <div className={s.progress} aria-hidden>
        <span style={{ animationDuration: `${Math.max(timing.waitMs, 1)}ms` }} />
      </div>
      <p className={s.waitingNote}>Waiting for the answer. This is a simulation, no money moves.</p>
    </section>
  )
}
