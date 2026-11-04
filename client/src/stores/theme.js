/* Light, dark or follow the system. The choice is remembered in this browser when it can be. */
import { create } from 'zustand'

const KEY = 'pb.theme'
const CHOICES = ['system', 'light', 'dark']

function stored() {
  try {
    const value = window.localStorage.getItem(KEY)
    return CHOICES.includes(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

const systemIsDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

export const resolveTheme = (choice, dark = systemIsDark()) =>
  choice === 'system' ? (dark ? 'dark' : 'light') : choice

const apply = (theme) => {
  document.documentElement.dataset.theme = theme
}

export const useTheme = create((set, get) => ({
  choice: stored(),
  theme: resolveTheme(stored()),

  set(choice) {
    try {
      window.localStorage.setItem(KEY, choice)
    } catch {
      /* private mode: the choice lasts until the tab closes */
    }
    const theme = resolveTheme(choice)
    apply(theme)
    set({ choice, theme })
  },

  /* system -> light -> dark -> system */
  cycle() {
    const next = CHOICES[(CHOICES.indexOf(get().choice) + 1) % CHOICES.length]
    get().set(next)
  },
}))

/* Applies the theme now and follows the system while the choice is "system". Returns the stop function. */
export function startTheme() {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const sync = () => {
    const { choice } = useTheme.getState()
    const theme = resolveTheme(choice, media.matches)
    apply(theme)
    useTheme.setState({ theme })
  }
  sync()
  media.addEventListener('change', sync)
  return () => media.removeEventListener('change', sync)
}
