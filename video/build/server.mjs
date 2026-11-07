/* A tiny local web server for the render page. It serves the page itself, the files made by the build (voice, timeline,
   footage, map, code) and a few files of the project (fonts, logos, the architecture diagram). Nothing else. */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'

const here = import.meta.dirname
const repo = join(here, '..', '..')
const roots = [
  { prefix: '/work/', dir: join(here, '..', 'work') },
  { prefix: '/repo/', dir: repo, allow: ['node_modules/@fontsource', 'brand/output', 'docs/', 'client/public'] },
  { prefix: '/', dir: join(here, 'render') },
]

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
}

export function startServer(port = 0) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://x').pathname)
    for (const root of roots) {
      if (!path.startsWith(root.prefix)) continue
      const relative = normalize(path.slice(root.prefix.length)).replace(/^([/\\])+/, '')
      if (relative.startsWith('..')) break
      if (root.allow && !root.allow.some((allowed) => relative.replaceAll(sep, '/').startsWith(allowed))) break
      const file = join(root.dir, relative === '.' || relative === '' ? 'index.html' : relative)
      if (existsSync(file) && statSync(file).isFile()) {
        response.writeHead(200, {
          'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
          'Cache-Control': 'no-cache',
        })
        createReadStream(file).pipe(response)
        return
      }
    }
    response.writeHead(404)
    response.end('not found')
  })
  return new Promise((resolve) =>
    server.listen(port, '127.0.0.1', () =>
      resolve({ port: server.address().port, close: () => new Promise((done) => server.close(done)) }),
    ),
  )
}
