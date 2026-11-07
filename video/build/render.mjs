/* Draws the film frame by frame, in parallel, with the Chrome that is installed on this machine.
   Usage:
     node render.mjs preview 12.5 40 61.2      stills at those seconds, into work/preview/
     node render.mjs frames [from] [to]        the film (or part of it) into work/frames/, one jpg per frame
   Every frame is a call to window.seek(t) on the render page, so what you see does not depend on machine speed. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { startServer } from './server.mjs'

const here = import.meta.dirname
const work = join(here, '..', 'work')
const [mode, ...args] = process.argv.slice(2)
const timeline = JSON.parse(readFileSync(join(work, 'timeline.json'), 'utf8'))
const FPS = timeline.fps
const WORKERS = Number(process.env.WORKERS ?? 8)

const server = await startServer()
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--font-render-hinting=none',
    '--autoplay-policy=no-user-gesture-required',
  ],
})

async function open() {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('page error:', error.message))
  page.on('console', (message) => message.type() === 'error' && console.error('console error:', message.text()))
  await page.goto(`http://127.0.0.1:${server.port}/`)
  await page.waitForFunction(() => window.filmReady === true, null, { timeout: 60000 })
  return page
}

try {
  if (mode === 'preview') {
    const dir = join(work, 'preview')
    mkdirSync(dir, { recursive: true })
    const page = await open()
    for (const value of args) {
      await page.evaluate((t) => window.seek(t), Number(value))
      const file = join(dir, `t${String(value).replace('.', '_')}.png`)
      await page.screenshot({ path: file, type: 'png' })
      console.log('wrote', file)
    }
  } else if (mode === 'frames') {
    const dir = join(work, 'frames')
    mkdirSync(dir, { recursive: true })
    const total = Math.ceil(timeline.total * FPS)
    const from = Number(args[0] ?? 0)
    const to = Math.min(Number(args[1] ?? total - 1), total - 1)
    const pages = await Promise.all(Array.from({ length: WORKERS }, open))
    const started = Date.now()
    let done = 0
    await Promise.all(
      pages.map(async (page, worker) => {
        for (let frame = from + worker; frame <= to; frame += WORKERS) {
          await page.evaluate((t) => window.seek(t), frame / FPS)
          await page.screenshot({ path: join(dir, `${String(frame).padStart(6, '0')}.jpg`), type: 'jpeg', quality: 92 })
          done += 1
          if (done % 200 === 0) {
            const rate = done / ((Date.now() - started) / 1000)
            console.log(`${done}/${to - from + 1} frames, ${rate.toFixed(1)} per second`)
          }
        }
      }),
    )
    writeFileSync(join(work, 'frames.done'), String(to - from + 1))
    console.log(`done: ${to - from + 1} frames in ${((Date.now() - started) / 1000).toFixed(0)} s`)
  } else {
    console.log('usage: node render.mjs preview <seconds...> | frames [from] [to]')
  }
} finally {
  await browser.close()
  await server.close()
}
