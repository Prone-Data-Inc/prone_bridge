/* The seller copilot: ask about the business in plain words. It reads the seller's real data to answer, and it can prepare
   changes (a payment method on or off, a payment link, a payout). A change happens only when the seller presses Confirm.
   Everything it writes is marked as AI. */
import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Check, Sparkle, Trash, X } from '@phosphor-icons/react'
import { useCopilot } from '@/stores/copilot.js'
import { copyText, linkUrl } from '@/lib/links.js'
import { toast } from '@/stores/toasts.js'
import Badge from '@/ui/Badge.jsx'
import { Button } from '@/ui/Button.jsx'
import { Card } from '@/ui/Card.jsx'
import PageHeader from '@/ui/PageHeader.jsx'
import { EmptyState, Skeleton, Spinner } from '@/ui/States.jsx'
import p from '../Page.module.css'
import RichText from './RichText.jsx'
import c from './Copilot.module.css'

const MAX = 2000

const SUGGESTIONS = [
  'How were my sales this month?',
  'Which country loses the most visitors, and why?',
  'Which payment method works best in Ghana?',
  'Turn on mobile money in Kenya',
  'Make a payment link for AI for Work that ends in 14 days',
  'Pay out what I am owed',
]

const STATUS = {
  pending: null,
  confirmed: { tone: 'success', label: 'Done' },
  dismissed: { tone: 'neutral', label: 'Dismissed' },
  failed: { tone: 'danger', label: 'Did not work' },
  expired: { tone: 'neutral', label: 'No longer available' },
}

/* What a confirmed change leaves behind that is worth showing. */
function Result({ action }) {
  const code = action.result?.link?.code
  if (action.status !== 'confirmed' || !code) return null
  const url = linkUrl(code)
  return (
    <p className={c.meta}>
      <span>{url}</span>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => toast((await copyText(url)) ? 'Link copied.' : 'Could not copy the link.')}
      >
        Copy
      </Button>
    </p>
  )
}

function Action({ action, onDecide }) {
  const done = STATUS[action.status]
  return (
    <div className={c.action} data-status={action.status}>
      <div className={c.meta}>
        <Badge tone="accent">Prepared by the copilot</Badge>
        {done && (
          <Badge tone={done.tone} dot>
            {done.label}
          </Badge>
        )}
      </div>
      <p className={c.actionTitle}>{action.summary}</p>
      {action.status === 'pending' && (
        <>
          <p className={c.meta}>Nothing changes until you press Confirm. It expires in 15 minutes.</p>
          <div className={c.actionButtons}>
            <Button variant="primary" icon={Check} loading={action.busy} onClick={() => onDecide(action.id, 'confirm')}>
              Confirm
            </Button>
            <Button icon={X} disabled={action.busy} onClick={() => onDecide(action.id, 'dismiss')}>
              Dismiss
            </Button>
          </div>
        </>
      )}
      {action.problem && action.status !== 'confirmed' && <p className={c.meta}>{action.problem}</p>}
      <Result action={action} />
    </div>
  )
}

function Turn({ item, onDecide }) {
  if (item.role === 'user') {
    return (
      <div className={c.turn} data-role="user">
        <p className={c.bubble} data-role="user">
          {item.content}
        </p>
      </div>
    )
  }
  return (
    <div className={c.turn} data-role="assistant">
      {item.error ? (
        <p className={c.bubble} data-role="assistant" data-error="true" role="alert">
          {item.error}
        </p>
      ) : (
        <RichText text={item.content} className={c.bubble} data-role="assistant" />
      )}
      {item.steps.length > 0 && (
        <p className={c.steps} aria-label="What the copilot looked at">
          {item.steps.map((step) => (
            <span key={step.tool} className={c.step}>
              {step.label}
            </span>
          ))}
        </p>
      )}
      {item.actions.map((action) => (
        <Action key={action.id} action={action} onDecide={onDecide} />
      ))}
      {!item.error && <span className={c.meta}>AI answer. Check important numbers on your dashboard.</span>}
    </div>
  )
}

export default function Copilot() {
  const { status, statusError, turns, asking, waiting, loadStatus, ask, decide, reset } = useCopilot()
  const [text, setText] = useState('')
  const end = useRef(null)

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' })
  }, [turns.length, asking])

  function send(question = text) {
    if (!question.trim() || asking) return
    ask(question)
    setText('')
  }

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  const low = status?.enabled && status.remainingTokens < status.dailyTokenBudget * 0.1

  if (!status && !statusError) {
    return (
      <div className={p.page}>
        <PageHeader title="Copilot" subtitle="Ask anything about your business." />
        <Skeleton height={260} radius={16} />
      </div>
    )
  }

  if (statusError && !status) {
    return (
      <div className={p.page}>
        <PageHeader title="Copilot" subtitle="Ask anything about your business." />
        <EmptyState
          icon={Sparkle}
          title="We could not load the copilot"
          action={<Button onClick={loadStatus}>Try again</Button>}
        >
          {statusError}
        </EmptyState>
      </div>
    )
  }

  if (!status.enabled) {
    return (
      <div className={p.page}>
        <PageHeader title="Copilot" subtitle="Ask anything about your business." />
        <EmptyState icon={Sparkle} title="The copilot is off">
          The AI is not connected yet. Everything else in the dashboard works as usual.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className={p.page}>
      <PageHeader
        title="Copilot"
        subtitle="Ask anything about your business."
        actions={
          turns.length > 0 ? (
            <Button variant="ghost" icon={Trash} onClick={reset} disabled={asking}>
              Clear conversation
            </Button>
          ) : null
        }
      />

      <div className={c.wrap}>
        {turns.length === 0 && (
          <Card>
            <div className={c.intro}>
              <p>
                Ask about your sales, countries, payouts or payment links. The copilot reads your real data to answer.
                It can also prepare a change, but nothing happens until you press Confirm.
              </p>
              <div className={c.suggestions}>
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className={c.suggestion}
                    disabled={asking}
                    onClick={() => send(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <p className={c.meta}>Written by AI, from demo data. Payments with local methods are simulated.</p>
            </div>
          </Card>
        )}

        {waiting.length > 0 && (
          <section className={c.waiting} aria-label="Changes waiting for you">
            <h2 className={c.actionTitle}>Waiting for you</h2>
            {waiting.map((action) => (
              <Action key={action.id} action={action} onDecide={decide} />
            ))}
          </section>
        )}

        <div className={c.thread} aria-live="polite">
          {turns.map((item) => (
            <Turn key={item.id} item={item} onDecide={decide} />
          ))}
          {asking && (
            <div className={c.thinking} role="status">
              <Spinner size={18} label="The copilot is working" />
              <span>Reading your data</span>
            </div>
          )}
          <span ref={end} />
        </div>

        <form
          className={c.composer}
          onSubmit={(event) => {
            event.preventDefault()
            send()
          }}
        >
          <div className={c.composerRow}>
            <textarea
              className={c.input}
              aria-label="Ask the copilot"
              placeholder="Ask about your business"
              rows={1}
              maxLength={MAX}
              value={text}
              disabled={asking}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <Button type="submit" variant="primary" icon={ArrowUp} loading={asking} disabled={!text.trim()}>
              Ask
            </Button>
          </div>
          <div className={c.composerNote}>
            <span>Enter to send, Shift and Enter for a new line.</span>
            <span>{low ? 'The AI is almost out of budget for today.' : `${text.length} / ${MAX}`}</span>
          </div>
        </form>
      </div>
    </div>
  )
}
