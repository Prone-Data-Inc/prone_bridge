/* The demo director, inside the "Demo" pill: scenarios that run through the real pipeline, and a reset. Each scenario says
   what really happened when it is done, and where to watch it. Hidden when the server has the demo tools switched off. */
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, Play, Warning, XCircle } from '@phosphor-icons/react'
import { getDemoState, resetDemo, runScenario } from '@/api/demo.js'
import { reloadApp } from '@/lib/reload.js'
import { useNav } from '@/stores/nav.js'
import { useSession } from '@/stores/session.js'
import { toast } from '@/stores/toasts.js'
import { Button } from '@/ui/Button.jsx'
import Modal from '@/ui/Modal.jsx'
import { Skeleton } from '@/ui/States.jsx'
import s from './DemoPanel.module.css'

const ICON = { ok: CheckCircle, warn: Warning, bad: XCircle }

/* A scenario that may take a while, because it calls the AI or makes many payments. */
const SLOW = new Set(['rush', 'attack', 'suspicious'])

function Result({ result, onWatch }) {
  return (
    <section className={s.result} role="status" aria-label={`Result: ${result.title}`}>
      <h3 className={s.headline}>{result.headline}</h3>
      <ul className={s.steps}>
        {result.steps.map((step, index) => {
          const Icon = ICON[step.tone] ?? CheckCircle
          return (
            <li key={index} className={s.step} data-tone={step.tone}>
              <Icon size={16} weight="fill" aria-hidden />
              <span>{step.text}</span>
            </li>
          )
        })}
      </ul>
      <div className={s.watch}>
        <span className={s.note}>Watch it:</span>
        {result.watch.map((place) => (
          <Button key={`${place.tab}/${place.section}`} size="sm" onClick={() => onWatch(place)}>
            {place.label}
          </Button>
        ))}
        <span className={s.note}>Took {result.seconds} s.</span>
      </div>
    </section>
  )
}

export default function DemoPanel({ onClose }) {
  const go = useNav((state) => state.go)
  const [state, setState] = useState({ status: 'loading', data: null })
  const [running, setRunning] = useState(null)
  const [result, setResult] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [resetting, setResetting] = useState(false)

  const show = useCallback((data) => setState({ status: data?.enabled ? 'ready' : 'off', data }), [])

  /* Where the demo stands, when the panel opens. */
  useEffect(() => {
    let current = true
    getDemoState().then(
      (data) => current && show(data),
      () => current && show(null),
    )
    return () => {
      current = false
    }
  }, [show])

  /* Again, after a scenario ran: what is available has changed. */
  const load = useCallback(() => getDemoState().then(show, () => {}), [show])

  async function run(scenario) {
    setRunning(scenario.id)
    setResult(null)
    try {
      setResult(await runScenario(scenario.id))
    } catch (error) {
      toast(error.message, { tone: 'danger' })
    } finally {
      setRunning(null)
      load()
    }
  }

  async function reset() {
    setResetting(true)
    try {
      await resetDemo()
      useSession.getState().forgetBuyer()
      toast('The demo was reset. Loading the fresh data.', { tone: 'success' })
      setTimeout(reloadApp, 800)
    } catch (error) {
      toast(error.message, { tone: 'danger' })
      setResetting(false)
      setConfirming(false)
    }
  }

  if (state.status === 'loading') return <Skeleton height={120} radius={12} />
  if (state.status !== 'ready') return null
  const { scenarios, made, waiting, empty } = state.data

  return (
    <>
      <section className={s.panel} aria-labelledby="scenarios-title">
        <h3 id="scenarios-title" className={s.title}>
          Run a scenario
        </h3>
        <p className={s.note}>
          Each one goes through the real checkout, the real risk rules and the real notifications. Open the other tabs
          to watch it happen.
        </p>
        <ul className={s.list}>
          {scenarios.map((scenario) => (
            <li key={scenario.id} className={s.row}>
              <div className={s.text}>
                <span className={s.name}>{scenario.title}</span>
                <span className={s.blurb}>{scenario.blurb}</span>
                {!scenario.available && <span className={s.reason}>{scenario.reason}</span>}
              </div>
              <Button
                size="sm"
                icon={Play}
                loading={running === scenario.id}
                disabled={!scenario.available || running !== null || resetting}
                onClick={() => run(scenario)}
                aria-label={`Run ${scenario.title}`}
              >
                Run
              </Button>
            </li>
          ))}
        </ul>
        {running && SLOW.has(running) && (
          <p className={s.note} role="status">
            This one can take up to 15 seconds.
          </p>
        )}
        {result && (
          <Result
            result={result}
            onWatch={(place) => {
              go(place.tab, place.section)
              onClose()
            }}
          />
        )}
      </section>

      <section className={s.panel} aria-labelledby="reset-title">
        <h3 id="reset-title" className={s.title}>
          Reset the demo
        </h3>
        <p className={s.note}>
          {empty
            ? 'The demo has no data yet. A reset writes it: ninety days of history up to today.'
            : `${
                made === 0 && waiting === 0
                  ? 'Nothing has been made since the last reset.'
                  : `${made} payment${made === 1 ? '' : 's'} made so far${waiting > 0 ? `, ${waiting} waiting for review` : ''}.`
              } A reset erases what was made and writes fresh demo history up to today.`}
        </p>
        <Button variant="danger" onClick={() => setConfirming(true)} disabled={running !== null}>
          Reset the demo
        </Button>
      </section>

      <Modal
        open={confirming}
        onClose={() => !resetting && setConfirming(false)}
        title="Reset the demo?"
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirming(false)} disabled={resetting}>
              Cancel
            </Button>
            <Button variant="danger" loading={resetting} onClick={reset}>
              Reset
            </Button>
          </>
        }
      >
        <p>
          This erases every payment, buyer, payment link, notification and change made in the demo, and writes fresh
          demo history up to today. It takes a few seconds, and the page loads again. It cannot be undone.
        </p>
      </Modal>
    </>
  )
}
