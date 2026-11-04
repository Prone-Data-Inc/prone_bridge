/* What a method needs from the buyer before they pay, and the demo control for the simulated ones. */
import Segmented from '@/ui/Segmented.jsx'
import { Input } from '@/ui/Field.jsx'
import { OUTCOMES } from './simulation.js'
import s from './Checkout.module.css'

const NOTES = {
  bank_transfer: 'You will get bank details to pay from your banking app.',
  ussd: 'You will get a short code to dial on your phone.',
  voucher: 'You will get a code to pay cash at an agent.',
}

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

      {method.simulated && (
        <div className={s.demo}>
          <div className={s.demoText}>
            <p className={s.demoTitle}>Demo control</p>
            <p className={s.demoHint}>This payment is simulated. Choose how it ends.</p>
          </div>
          <Segmented label="Test outcome" value={outcome} onChange={onOutcome} options={OUTCOMES} />
        </div>
      )}
    </div>
  )
}
