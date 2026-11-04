/* Installs the git hooks of this repo (runs after npm install). It points git at .githooks, where the pre-commit hook
   scans staged files for secrets. Outside a git repository (Docker, Vercel, a zip) it does nothing and never fails. */
import { chmodSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const hooksDir = '.githooks'

function git(...args) {
  return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
}

function install() {
  if (!existsSync(new URL('../.git', import.meta.url))) return 'no git repository here, hooks skipped'
  git('config', 'core.hooksPath', hooksDir)
  for (const hook of ['pre-commit']) {
    try {
      chmodSync(new URL(`../${hooksDir}/${hook}`, import.meta.url), 0o755)
    } catch {
      /* Windows does not use file modes */
    }
  }
  return 'git hooks installed'
}

try {
  console.log(`[hooks] ${install()}`)
} catch (error) {
  console.log(`[hooks] skipped (${error.code ?? error.message})`)
}
