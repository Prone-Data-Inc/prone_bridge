/* Small structured logger. JSON lines in production (what Vercel and Docker collect), one readable line in development.
   child() adds fields to every line, which is how each request gets its id. */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 }

export function createLogger({ level = 'info', json = false, base = {}, write = defaultWrite } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info

  function log(name, message, fields) {
    if (LEVELS[name] < threshold) return
    const entry = { level: name, time: new Date().toISOString(), message, ...base, ...fields }
    write(name, json ? JSON.stringify(entry) : pretty(entry))
  }

  return {
    debug: (message, fields) => log('debug', message, fields),
    info: (message, fields) => log('info', message, fields),
    warn: (message, fields) => log('warn', message, fields),
    error: (message, fields) => log('error', message, fields),
    child: (fields) => createLogger({ level, json, write, base: { ...base, ...fields } }),
  }
}

function defaultWrite(name, line) {
  const out = name === 'error' ? console.error : name === 'warn' ? console.warn : console.log
  out(line)
}

function pretty({ level, time, message, ...fields }) {
  const rest = Object.entries(fields)
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' ')
  return `${time.slice(11, 19)} ${level.toUpperCase().padEnd(5)} ${message}${rest ? ` ${rest}` : ''}`
}
