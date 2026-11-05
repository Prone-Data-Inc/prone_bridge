/* Approve or reject a payment held for review. A short note is optional and is kept with the decision. */
import { useState } from 'react'
import { Input } from '@/ui/Field.jsx'
import { Button } from '@/ui/Button.jsx'
import Modal from '@/ui/Modal.jsx'
import { approvePayment, rejectPayment } from '@/api/admin.js'
import { toast } from '@/stores/toasts.js'
import a from './Admin.module.css'

const TEXT = {
  approve: {
    title: 'Approve this payment',
    body: 'The buyer is told the check is done and can finish paying. Nothing is charged until they do.',
    button: 'Approve',
    variant: 'primary',
    done: 'Approved. The buyer can finish paying.',
  },
  reject: {
    title: 'Reject this payment',
    body: 'The payment is blocked. The buyer and the seller are told, and no money moves.',
    button: 'Reject',
    variant: 'danger',
    done: 'Rejected and blocked.',
  },
}

/* action: 'approve' or 'reject'. onDone runs after the decision was saved. */
export default function DecisionDialog({ payment, action, onClose, onDone }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const text = TEXT[action]

  async function decide() {
    setBusy(true)
    try {
      await (action === 'approve' ? approvePayment : rejectPayment)(payment.id, note.trim() || undefined)
      toast(text.done, { tone: action === 'approve' ? 'success' : 'neutral' })
      onDone()
      onClose()
    } catch (error) {
      toast(error.message, { tone: 'danger' })
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={text.title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={text.variant} loading={busy} onClick={decide}>
            {text.button}
          </Button>
        </>
      }
    >
      <div className={a.noteField}>
        <p>
          <strong>{payment.reference}</strong> for {payment.product.title}. {text.body}
        </p>
        <Input
          label="Note (optional)"
          value={note}
          maxLength={240}
          onChange={(event) => setNote(event.target.value)}
          hint="Kept in the audit log. The buyer never sees it."
        />
      </div>
    </Modal>
  )
}
