/* One button that steps through system, light and dark. */
import { Desktop, Moon, Sun } from '@phosphor-icons/react'
import { IconButton } from '@/ui/Button.jsx'
import { useTheme } from '@/stores/theme.js'

const ICONS = { system: Desktop, light: Sun, dark: Moon }
const NAMES = { system: 'System', light: 'Light', dark: 'Dark' }

export default function ThemeToggle() {
  const choice = useTheme((state) => state.choice)
  const cycle = useTheme((state) => state.cycle)
  return <IconButton icon={ICONS[choice]} label={`Theme: ${NAMES[choice]}. Click to change.`} onClick={cycle} />
}
