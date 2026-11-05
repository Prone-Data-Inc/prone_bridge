/* The root: starts the live pieces (router, theme, live updates, notifications) and draws the shell. */
import AppShell from '@/components/layout/AppShell.jsx'
import { useLiveData } from '@/hooks/useLiveData.js'
import { useResetWatcher } from '@/hooks/useResetWatcher.js'

export default function App() {
  useLiveData()
  useResetWatcher()
  return <AppShell />
}
