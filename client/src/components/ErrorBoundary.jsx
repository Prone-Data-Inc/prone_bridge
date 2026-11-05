/* Catches a page that crashes while it draws, so one broken page never blanks the whole app. The rest keeps working: the
   other tabs, the tab strip and the toolbar stay. A new page (resetKey changes) starts clean. A page that cannot even load
   (usually an old tab after a new version went up) says so and offers a reload. */
import { Component } from 'react'
import { ArrowClockwise, WarningOctagon } from '@phosphor-icons/react'
import { reloadApp } from '@/lib/reload.js'
import { isStaleBuild } from '@/lib/staleBuild.js'
import { Button } from '@/ui/Button.jsx'
import { EmptyState } from '@/ui/States.jsx'
import s from './ErrorBoundary.module.css'

export default class ErrorBoundary extends Component {
  state = { error: null, key: this.props.resetKey }

  static getDerivedStateFromError(error) {
    return { error }
  }

  /* Moving to another page clears the error. */
  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }

  componentDidCatch(error, info) {
    console.error('A page crashed.', error, info?.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const stale = isStaleBuild(error)
    const wholeApp = this.props.scope === 'app'
    return (
      <div className={wholeApp ? s.app : s.page} role="alert">
        <EmptyState
          icon={WarningOctagon}
          title={
            stale ? 'A new version is out' : wholeApp ? 'ProneBridge stopped working' : 'Something broke on this page'
          }
          action={
            <div className={s.actions}>
              {!stale && !wholeApp && (
                <Button onClick={() => this.setState({ error: null })} icon={ArrowClockwise}>
                  Try again
                </Button>
              )}
              <Button variant="primary" onClick={reloadApp}>
                Reload the app
              </Button>
            </div>
          }
        >
          {stale
            ? 'This page was opened before an update. Reload to get the latest version.'
            : wholeApp
              ? 'Reload to start again. If it keeps happening, tell the people who run this demo.'
              : 'The rest of the app still works. Try the page again, or open another one.'}
        </EmptyState>
      </div>
    )
  }
}
