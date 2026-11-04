/* Stops the dev server and the build when a VITE_ variable holds a secret. Vite ships every VITE_ variable to the
   browser, so a service role key there would hand the whole database to anyone who opens the site. */
import { inspectSupabaseKey } from '../../shared/src/supabaseKey.js'

export function findLeakedKeys(env) {
  return Object.entries(env)
    .filter(([name]) => name.startsWith('VITE_'))
    .filter(([name, value]) => /KEY|SECRET|TOKEN/.test(name) && inspectSupabaseKey(value) === 'secret')
    .map(([name]) => name)
}

export function guardBrowserKeys(env) {
  return {
    name: 'pronebridge-guard-browser-keys',
    configResolved() {
      const leaked = findLeakedKeys(env)
      if (leaked.length) {
        throw new Error(
          `${leaked.join(', ')} holds a secret Supabase key. Variables starting with VITE_ reach the browser. ` +
            'Use the anon (public) key there and keep the service role key out of the app.',
        )
      }
    },
  }
}
