/* Secret scanner. This repo is public, so a key must never reach a commit, not even once in the history.
     node scripts/scan-secrets.js              every file git would commit (or every file, outside git)
     node scripts/scan-secrets.js --staged     what is staged right now (the pre-commit hook)
     node scripts/scan-secrets.js --history    every added line of every commit
   It prints where and which rule matched, never the secret itself, and exits 1 when something is found.
   Put "secret-scan:allow" on a line to accept a deliberate false positive. */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ALLOW_MARKER = 'secret-scan:allow'

export const RULES = [
  { id: 'openai-key', pattern: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/ },
  { id: 'private-key', pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/ },
  { id: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { id: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}/ },
  { id: 'aws-access-key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: 'live-payment-key', pattern: /\b[rs]k_live_[A-Za-z0-9]{16,}/ },
  { id: 'database-url-with-password', pattern: /\bpostgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]{3,}@[^\s/]+/ },
]

/* NAME_WITH_SECRET=value, in env files, YAML, JSON or code, when the value is long and not an obvious placeholder. */
const ASSIGNMENT =
  /^\s*(?:export\s+)?["']?([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|SERVICE_ROLE_KEY)[A-Z0-9_]*)["']?\s*[:=]\s*["']?([A-Za-z0-9+/=_.~-]{12,})/
const PLACEHOLDER =
  /^(?:your|change|example|placeholder|replace|xxx|todo|sandbox|process\.env|import\.meta|true|false|null|undefined)/i

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.vercel', 'output'])
const SKIP_FILES = new Set(['package-lock.json'])
const BINARY = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.pdf',
  '.mp4',
  '.zip',
])
const MAX_BYTES = 1024 * 1024

export function isSecretFileName(path) {
  const name = basename(path)
  if (name === '.env.example') return false
  return /^\.env(\..+)?$/.test(name) || /\.(pem|p12|pfx|key)$/i.test(name) || /^id_(rsa|dsa|ecdsa|ed25519)/.test(name)
}

/* Findings in one text: [{ line, rule }]. Lines marked secret-scan:allow are skipped. */
export function scanText(text) {
  const findings = []
  text.split('\n').forEach((line, index) => {
    if (line.includes(ALLOW_MARKER)) return
    for (const rule of RULES) if (rule.pattern.test(line)) findings.push({ line: index + 1, rule: rule.id })
    const assignment = ASSIGNMENT.exec(line)
    if (assignment && !PLACEHOLDER.test(assignment[2])) findings.push({ line: index + 1, rule: 'secret-assignment' })
  })
  return findings
}

const skipPath = (path) => {
  const parts = path.split(/[\\/]/)
  return (
    parts.some((part) => SKIP_DIRS.has(part)) ||
    SKIP_FILES.has(basename(path)) ||
    BINARY.has(extname(path).toLowerCase())
  )
}

const git = (args, options = {}) =>
  execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], ...options })
const inGit = () => existsSync(join(ROOT, '.git'))

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else files.push(relative(ROOT, full))
  }
  return files
}

/* The files to read and a function that returns the text of each. */
function source(mode) {
  if (mode === 'staged') {
    const names = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
      .toString()
      .split('\0')
      .filter(Boolean)
    return { names, read: (name) => git(['show', `:${name}`]).toString('utf8') }
  }
  const names = inGit()
    ? git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).toString().split('\0').filter(Boolean)
    : walk(ROOT).filter((name) => !/^\.env(\..+)?$/.test(basename(name)) || basename(name) === '.env.example')
  return {
    names,
    read: (name) => readFileSync(join(ROOT, name), 'utf8'),
    size: (name) => statSync(join(ROOT, name)).size,
  }
}

function scanFiles(mode) {
  const { names, read, size } = source(mode)
  const found = []
  for (const name of names) {
    if (isSecretFileName(name)) {
      found.push({ file: name, line: 0, rule: 'secret-file' })
      continue
    }
    if (skipPath(name)) continue
    try {
      if (size && size(name) > MAX_BYTES) continue
      const text = read(name)
      if (text.includes('\0')) continue
      for (const finding of scanText(text)) found.push({ file: name, ...finding })
    } catch {
      /* deleted or unreadable: nothing to scan */
    }
  }
  return found
}

/* Every line added by any commit, on any branch. */
async function scanHistory() {
  const found = []
  const log = spawn('git', ['log', '--all', '-p', '-U0', '--no-color', '--no-ext-diff'], { cwd: ROOT })
  let commit = ''
  let file = ''
  let line = 0
  for await (const text of createInterface({ input: log.stdout, crlfDelay: Infinity })) {
    if (text.startsWith('commit ')) commit = text.slice(7, 14)
    else if (text.startsWith('+++ b/')) file = text.slice(6)
    else if (text.startsWith('@@')) line = Number(/\+(\d+)/.exec(text)?.[1] ?? 0) - 1
    else if (text.startsWith('+') && !text.startsWith('+++')) {
      line += 1
      if (!skipPath(file))
        for (const finding of scanText(text.slice(1)))
          found.push({ file: `${file}@${commit}`, line, rule: finding.rule })
    }
  }
  return found
}

export async function main(argv = process.argv.slice(2)) {
  const mode = argv.includes('--staged') ? 'staged' : argv.includes('--history') ? 'history' : 'all'
  if ((mode === 'staged' || mode === 'history') && !inGit()) {
    console.log(`[secrets] no git repository here, nothing to scan for --${mode}`)
    return 0
  }
  const found = mode === 'history' ? await scanHistory() : scanFiles(mode)
  if (!found.length) {
    console.log(`[secrets] clean (${mode})`)
    return 0
  }
  console.error(
    `[secrets] ${found.length} possible secret${found.length === 1 ? '' : 's'} found (${mode}). Values are not printed.`,
  )
  for (const { file, line, rule } of found) console.error(`  ${file}${line ? `:${line}` : ''}  ${rule}`)
  console.error(
    'Remove the secret and rotate it if it was ever shared. A deliberate false positive can carry "secret-scan:allow".',
  )
  return 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await main()
