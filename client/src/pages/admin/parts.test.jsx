// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { assessment, signal } from '../../../test/adminData.js'
import { AssessmentPanel, Explanation, RiskBadge, RiskCell, ScoreMeter, SignalList } from './parts.jsx'
import { RISK, riskLabel, riskTone } from './risk.js'

describe('risk vocabulary', () => {
  it('names and colours the three levels, and a payment nobody scored', () => {
    expect(Object.keys(RISK)).toEqual(['low', 'medium', 'high'])
    expect([riskLabel('low'), riskLabel('medium'), riskLabel('high'), riskLabel(undefined)]).toEqual([
      'Low',
      'Medium',
      'High',
      'Not scored',
    ])
    expect([riskTone('low'), riskTone('medium'), riskTone('high'), riskTone(null)]).toEqual([
      'success',
      'warning',
      'danger',
      'neutral',
    ])
  })
})

describe('RiskBadge', () => {
  it('reads the level and the score', () => {
    render(<RiskBadge risk={{ level: 'high', score: 75 }} />)
    expect(screen.getByText('High 75')).toBeTruthy()
  })

  it('says "Not scored" without a rating', () => {
    render(<RiskBadge risk={null} />)
    expect(screen.getByText('Not scored')).toBeTruthy()
  })

  it('works as a grid cell', () => {
    render(<RiskCell value="medium" data={{ score: 41 }} />)
    expect(screen.getByText('Medium 41')).toBeTruthy()
    render(<RiskCell value="" data={{ score: null }} />)
    expect(screen.getByText('Not scored')).toBeTruthy()
  })
})

describe('ScoreMeter', () => {
  it('describes the score in words, whatever it looks like', () => {
    render(<ScoreMeter score={72} level="high" />)
    const meter = screen.getByRole('img', { name: 'Risk score 72 out of 100, High' })
    expect(meter.querySelector('span').style.width).toBe('72%')
  })

  it('keeps a score of zero visible', () => {
    render(<ScoreMeter score={0} level="low" />)
    expect(screen.getByRole('img').querySelector('span').style.width).toBe('2%')
  })
})

describe('SignalList', () => {
  it('lists each rule with what it saw and its points', () => {
    render(
      <SignalList
        signals={[
          signal(),
          signal({ id: 'rapid_attempts', label: 'Rapid attempts', points: 20, fact: '3 other attempts.' }),
        ]}
      />,
    )
    const list = screen.getByRole('list', { name: 'Rules that fired' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByText('+20')).toBeTruthy()
    expect(within(list).getByText('3 other attempts.')).toBeTruthy()
  })

  it('says when no rule fired', () => {
    render(<SignalList signals={[]} />)
    expect(screen.getByText('No rule fired.')).toBeTruthy()
  })
})

describe('Explanation', () => {
  it('says who wrote it', () => {
    const { rerender } = render(<Explanation text="A note." source="ai" />)
    expect(screen.getByText("Written by AI from the rules' findings")).toBeTruthy()
    rerender(<Explanation text="A note." source="rules" />)
    expect(screen.getByText('Written by the rules')).toBeTruthy()
  })
})

describe('AssessmentPanel', () => {
  it('shows the score, the decision, the rules, the note and who decided', () => {
    render(
      <AssessmentPanel
        assessment={assessment({
          review: { decision: 'rejected', note: 'Looks wrong', at: '2026-11-04T11:00:00.000Z' },
        })}
      />,
    )
    expect(screen.getByText('Medium 40')).toBeTruthy()
    expect(screen.getByText('Held for review.')).toBeTruthy()
    expect(screen.getByText('Throwaway email')).toBeTruthy()
    expect(screen.getByText('A person rejected it: Looks wrong')).toBeTruthy()
  })

  it('ends the sentence when the person left no note', () => {
    render(
      <AssessmentPanel
        assessment={assessment({ review: { decision: 'approved', note: null, at: '2026-11-04T11:00:00.000Z' } })}
      />,
    )
    expect(screen.getByText('A person approved it.')).toBeTruthy()
  })

  it('explains a rating given after the payment was settled', () => {
    render(<AssessmentPanel assessment={assessment({ enforced: false })} />)
    expect(screen.getByText(/Scored after the payment was settled, so nothing was held or blocked/)).toBeTruthy()
  })
})
