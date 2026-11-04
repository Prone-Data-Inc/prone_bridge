/* The "Demo" pill in the tab strip. It opens a short, honest list of what is real and what is simulated. */
import { useState } from 'react'
import { Info } from '@phosphor-icons/react'
import Badge from '@/ui/Badge.jsx'
import { Button } from '@/ui/Button.jsx'
import Modal from '@/ui/Modal.jsx'
import s from './DemoNotice.module.css'

const REAL = [
  'PayPal checkout runs in the PayPal sandbox. No real money moves.',
  'The database, live updates and the AI are real.',
]

const SIMULATED = [
  'Mobile money, bank transfer, USSD and cash voucher payments.',
  'Exchange rates for local prices.',
  'The sellers, buyers, courses and sales history.',
]

function Group({ tone, title, items }) {
  return (
    <section className={s.group}>
      <Badge tone={tone}>{title}</Badge>
      <ul className={s.list}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

export default function DemoNotice() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" className={s.pill} onClick={() => setOpen(true)} aria-haspopup="dialog">
        <Info size={14} weight="bold" aria-hidden />
        Demo
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="About this demo"
        size="sm"
        footer={
          <Button variant="primary" onClick={() => setOpen(false)}>
            Got it
          </Button>
        }
      >
        <div className={s.content}>
          <Group tone="success" title="Real" items={REAL} />
          <Group tone="warning" title="Simulated" items={SIMULATED} />
          <p className={s.note}>No bank, wallet or payment company is integrated or named as a partner.</p>
        </div>
      </Modal>
    </>
  )
}
