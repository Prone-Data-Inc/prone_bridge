/* Launch screen of step 1: the brand, and a live check that the web app, the API and the integrations are wired.
   Step 3 replaces it with the three-tab workspace. */
import { CheckCircle, CircleDashed, WarningCircle } from '@phosphor-icons/react'
import { BRAND } from '#shared/brand/palette.js'
import { useHealth } from '@/hooks/useHealth.js'
import Logo from '@/ui/Logo.jsx'
import s from './App.module.css'

const ROWS = [
  { key: 'server', label: 'Server' },
  { key: 'database', label: 'Database' },
  { key: 'paypal', label: 'PayPal sandbox' },
  { key: 'ai', label: 'AI' },
]

/* One row's wording and tone, from what the API reported. */
function describe(key, { status, data }) {
  if (status === 'loading') return { text: 'Checking', tone: 'idle' }
  if (status === 'error') return key === 'server' ? { text: 'Offline', tone: 'bad' } : { text: 'Unknown', tone: 'idle' }
  if (key === 'server') return { text: 'Online', tone: 'good' }
  return data.integrations[key] === 'configured'
    ? { text: 'Configured', tone: 'good' }
    : { text: 'Not set up', tone: 'idle' }
}

const ICONS = { good: CheckCircle, bad: WarningCircle, idle: CircleDashed }

export default function App() {
  const health = useHealth()

  return (
    <main className={s.page}>
      <div className={s.content}>
        <Logo height={44} />
        <h1 className={s.title}>{BRAND.tagline}</h1>
        <p className={s.lead}>One checkout for every African market.</p>

        <ul className={s.list} aria-label="System status" aria-busy={health.status === 'loading'}>
          {ROWS.map(({ key, label }) => {
            const { text, tone } = describe(key, health)
            const Icon = ICONS[tone]
            return (
              <li key={key} className={s.row} data-tone={tone}>
                <Icon size={20} weight={tone === 'idle' ? 'regular' : 'fill'} className={s.icon} aria-hidden />
                <span className={s.label}>{label}</span>
                <span className={s.state}>{text}</span>
              </li>
            )
          })}
        </ul>

        {health.status === 'error' && (
          <button type="button" className={s.retry} onClick={health.retry}>
            Try again
          </button>
        )}

        <p className={s.note}>Demo build. Nothing here moves real money.</p>
      </div>
    </main>
  )
}
