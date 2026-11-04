/* What a method needs from the buyer before they pay, and the demo control. Local methods are simulations, card and PayPal
   run in the PayPal sandbox, and both say so. */
import Segmented from '@/ui/Segmented.jsx'
import { Input } from '@/ui/Field.jsx'
import { OUTCOMES } from './simulation.js'
import s from './Checkout.module.css'

const NOTES = {
  bank_transfer: 'You will get bank details to pay from your banking app.',
  ussd: 'You will get a short code to dial on your phone.',
  voucher: 'You will get a code to pay cash at an agent.',
  card: 'Sandbox: use the test card 4012 8888 8888 1881, any future date and any 3 digits. No money moves.',
  paypal: 'A PayPal window opens to approve the payment. Sandbox: no money moves.',
}

/* The sandbox can approve or refuse a payment. It has no time out. */
const SANDBOX_OUTCOMES = OUTCOMES.filter((outcome) => outcome.value !== 'timeout')

export default function MethodDetails({ method, phone, onPhone, outcome, onOutcome }) {
  if (!method) return null

  return (
    <div className={s.details}>
      {method.kind === 'mobile_money' && (
        <Input
          label="Mobile money number"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={phone}
          onChange={(event) => onPhone(event.target.value)}
          hint="A test number. Nothing is charged."
        />
      )}
      {NOTES[method.kind] && <p className={s.note}>{NOTES[method.kind]}</p>}

      <div className={s.demo}>
        <div className={s.demoText}>
          <p className={s.demoTitle}>Demo control</p>
          <p className={s.demoHint}>
            {method.simulated
              ? 'This payment is simulated. Choose how it ends.'
              : 'This payment runs in the PayPal sandbox. Choose how it ends.'}
          </p>
        </div>
        <Segmented
          label="Test outcome"
          value={outcome}
          onChange={onOutcome}
          options={method.simulated ? OUTCOMES : SANDBOX_OUTCOMES}
        />
      </div>
    </div>
  )
}
