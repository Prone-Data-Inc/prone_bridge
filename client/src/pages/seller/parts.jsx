/* Small pieces every seller page uses: the period switch, and the loading and error states. */
import { WarningCircle } from '@phosphor-icons/react'
import { Button } from '@/ui/Button.jsx'
import Segmented from '@/ui/Segmented.jsx'
import { EmptyState } from '@/ui/States.jsx'
import { RANGES } from './format.js'

export function RangeSwitch({ value, onChange }) {
  return <Segmented label="Period" value={value} onChange={onChange} options={RANGES} />
}

/* The three things a page can be besides ready: loading for the first time, failed with nothing to show, or ready.
   When a reload fails but the old numbers are there, they stay on screen. */
export function DataState({ state, onRetry, skeleton, children }) {
  if (state.status === 'loading' && !state.data) return skeleton
  if (state.status === 'error' && !state.data) {
    return (
      <EmptyState
        icon={WarningCircle}
        title="We could not load this"
        action={<Button onClick={() => onRetry()}>Try again</Button>}
      >
        {state.error}
      </EmptyState>
    )
  }
  return children
}
