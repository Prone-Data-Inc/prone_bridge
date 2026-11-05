/* Small pieces the admin pages share: the risk badge, the score meter, the list of rules that fired and the note that
   explains them. */
import Badge from '@/ui/Badge.jsx'
import { cx } from '@/lib/cx.js'
import a from './Admin.module.css'
import { DECISION_TEXT, SOURCE_TEXT, THRESHOLDS, riskLabel, riskTone } from './risk.js'

/* "Medium 40". A payment nobody scored reads "Not scored". */
export function RiskBadge({ risk }) {
  if (!risk) return <Badge>Not scored</Badge>
  return (
    <Badge tone={riskTone(risk.level)} dot>
      {riskLabel(risk.level)} {risk.score}
    </Badge>
  )
}

/* The cell of the data grid: value is the level, data carries the score. */
export function RiskCell({ value, data }) {
  return value ? <RiskBadge risk={{ level: value, score: data.score }} /> : <Badge>Not scored</Badge>
}

/* 0 to 100, with the two lines the rules draw at 30 and 60. */
export function ScoreMeter({ score, level }) {
  return (
    <div className={a.meter} role="img" aria-label={`Risk score ${score} out of 100, ${riskLabel(level)}`}>
      <span className={a.meterFill} data-level={level} style={{ width: `${Math.max(2, score)}%` }} />
      <i className={a.meterLine} style={{ left: `${THRESHOLDS.medium}%` }} />
      <i className={a.meterLine} style={{ left: `${THRESHOLDS.high}%` }} />
    </div>
  )
}

/* Each rule that fired, with what it saw and the points it added. */
export function SignalList({ signals }) {
  if (!signals?.length) return <p className={a.quiet}>No rule fired.</p>
  return (
    <ul className={a.signals} aria-label="Rules that fired">
      {signals.map((signal) => (
        <li key={signal.id} className={a.signal}>
          <div>
            <p className={a.signalLabel}>{signal.label}</p>
            <p className={a.quiet}>{signal.fact}</p>
          </div>
          <span className={a.points}>+{signal.points}</span>
        </li>
      ))}
    </ul>
  )
}

/* The sentence a reviewer reads, and who wrote it. */
export function Explanation({ text, source }) {
  return (
    <div className={a.explain}>
      <p>{text}</p>
      <p className={cx(a.quiet, a.source)}>{SOURCE_TEXT[source] ?? SOURCE_TEXT.rules}</p>
    </div>
  )
}

/* A payment's full rating: the score, what was decided, the rules and the note. */
export function AssessmentPanel({ assessment }) {
  return (
    <section className={a.assessment} aria-labelledby="assessment-title">
      <div className={a.assessmentHead}>
        <h3 id="assessment-title" className={a.heading}>
          Risk check
        </h3>
        <Badge tone={riskTone(assessment.level)} dot>
          {riskLabel(assessment.level)} {assessment.score}
        </Badge>
      </div>
      <ScoreMeter score={assessment.score} level={assessment.level} />
      <p className={a.quiet}>
        {DECISION_TEXT[assessment.decision]}.
        {assessment.enforced ? '' : ' Scored after the payment was settled, so nothing was held or blocked.'}
      </p>
      <SignalList signals={assessment.signals} />
      <Explanation text={assessment.explanation} source={assessment.explanationSource} />
      {assessment.review && (
        <p className={a.quiet}>
          A person {assessment.review.decision === 'approved' ? 'approved' : 'rejected'} it
          {assessment.review.note ? `: ${assessment.review.note}` : '.'}
        </p>
      )}
    </section>
  )
}
