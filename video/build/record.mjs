/* Films the app. It plays the whole demo in a real Chrome, like a person: a visible cursor, smooth scrolling, human typing,
   real clicks, and it captures every frame. It also notes the moment of each step (a "mark"), so the film can tie each step
   to the word being said. Frames and marks go to work/footage/.
   Usage: node record.mjs          (the app must be running on port 8100) */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const base = process.env.APP ?? 'http://127.0.0.1:8100'
const out = join(import.meta.dirname, '..', 'work', 'footage')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
mkdirSync(join(import.meta.dirname, '..', 'work', 'preview'), { recursive: true })

const WIDTH = 1568
const HEIGHT = 852
const SCALE = 1.5
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'],
})
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: SCALE,
  locale: 'en-US',
  timezoneId: 'Europe/Paris',
})

/* A cursor and a click ripple drawn inside the page, since a recording of a page has no mouse pointer. */
await context.addInitScript(() => {
  const start = () => {
    const style = document.createElement('style')
    style.textContent = `
      #__cursor{position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;pointer-events:none;transform:translate(-200px,-200px)}
      #__cursor svg{display:block;filter:drop-shadow(0 3px 4px rgba(11,27,63,.4))}
      .__ripple{position:fixed;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:3px solid rgba(0,112,224,.95);z-index:2147483646;pointer-events:none;animation:__ripple .6s ease-out forwards}
      @keyframes __ripple{from{transform:scale(.6);opacity:1}to{transform:scale(3.4);opacity:0}}
      html{scrollbar-width:none} ::-webkit-scrollbar{display:none}`
    document.head.append(style)
    const cursor = document.createElement('div')
    cursor.id = '__cursor'
    cursor.innerHTML =
      '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2.5 L4 19 L8.4 15 L11.2 21.4 L14 20.2 L11.2 14 L17 14 Z" fill="#fff" stroke="#0b1b3f" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    document.body.append(cursor)
    /* the app builds links from the address of the page, which here is the local server: show the public address that
       the deployed app would show, so the film never says 127.0.0.1 */
    const fix = (node) => {
      if (node.nodeType === 3) {
        if (node.nodeValue.includes('http://127.0.0.1:8100')) {
          node.nodeValue = node.nodeValue.replaceAll('http://127.0.0.1:8100', 'https://pronebridge.vercel.app')
        }
      } else if (node.id !== '__cursor') {
        for (const child of node.childNodes) fix(child)
      }
    }
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') fix(record.target)
        for (const added of record.addedNodes) fix(added)
      }
    }).observe(document, { subtree: true, childList: true, characterData: true })
    addEventListener('mousemove', (event) => {
      cursor.style.transform = `translate(${event.clientX - 4}px, ${event.clientY - 2}px)`
    })
    addEventListener('mousedown', (event) => {
      const ripple = document.createElement('div')
      ripple.className = '__ripple'
      ripple.style.left = `${event.clientX}px`
      ripple.style.top = `${event.clientY}px`
      document.body.append(ripple)
      setTimeout(() => ripple.remove(), 700)
    })
  }
  if (document.body) start()
  else addEventListener('DOMContentLoaded', start)
})

const page = await context.newPage()
page.on('pageerror', (error) => console.log('page error:', error.message))

/* Every frame the page paints goes to disk with its time. */
const cdp = await context.newCDPSession(page)
const frames = []
let counter = 0
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const name = `${String(counter).padStart(6, '0')}.jpg`
  counter += 1
  frames.push([metadata.timestamp, name])
  writeFileSync(join(out, name), Buffer.from(data, 'base64'))
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
})
const marks = {}
const mark = (name) => {
  marks[name] = Date.now() / 1000
  console.log(`  mark ${name}`)
}

/* A person moves the mouse, then clicks. */
let pointer = { x: 120, y: 420 }
async function moveTo(locator, { x = 0, y = 0, steps = 26 } = {}) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('nothing to point at')
  const target = { x: box.x + box.width / 2 + x, y: box.y + box.height / 2 + y }
  await page.mouse.move(target.x, target.y, { steps })
  pointer = target
}
async function click(locator, options) {
  await locator.scrollIntoViewIfNeeded()
  await moveTo(locator, options)
  await sleep(160)
  await page.mouse.down()
  await sleep(70)
  await page.mouse.up()
  await sleep(120)
}
async function typeInto(locator, text, delay = 62) {
  await click(locator)
  await locator.pressSequentially(text, { delay })
}
/* Scrolls the way a hand does: many small turns of the wheel. */
async function glide(distance, ms = 800) {
  const turns = Math.max(8, Math.round(ms / 28))
  for (let turn = 0; turn < turns; turn += 1) {
    /* eased: slow at the start and the end */
    const a = turn / turns
    const b = (turn + 1) / turns
    const ease = (x) => x * x * (3 - 2 * x)
    await page.mouse.wheel(0, distance * (ease(b) - ease(a)))
    await sleep(ms / turns)
  }
}
/* Brings an element into view with the browser's own smooth scroll. */
async function reveal(locator, block = 'center') {
  await locator.evaluate((element, where) => element.scrollIntoView({ block: where, behavior: 'smooth' }), block)
  await sleep(800)
}
const side = (name) => page.locator('aside nav').getByRole('button', { name, exact: true })

try {
  await page.goto(`${base}/#/buyer/home`)
  await page.getByRole('article').first().waitFor({ timeout: 30000 })
  await page.mouse.move(pointer.x, pointer.y)
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 82,
    maxWidth: Math.round(WIDTH * SCALE),
    maxHeight: Math.round(HEIGHT * SCALE),
    everyNthFrame: 1,
  })
  await sleep(900)

  /* ---- The buyer ------------------------------------------------------------------------------------------------ */
  console.log('buyer')
  mark('shop')
  await sleep(1100)
  await page.mouse.move(900, 500, { steps: 14 })
  await glide(340, 800)
  await sleep(350)
  const course = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'AI for Work' }) })
  await moveTo(course.getByRole('button', { name: 'Buy' }), { steps: 30 })
  await sleep(300)
  mark('buyClicked')
  await click(course.getByRole('button', { name: 'Buy' }))
  await page.getByText('Best match first').waitFor({ timeout: 30000 })
  mark('checkout')
  await sleep(1300)

  const country = page.getByLabel('Where are you paying from?')
  await click(country)
  await country.selectOption('NG')
  mark('country')
  await sleep(1900)

  mark('methods')
  await sleep(1300)

  /* PayPal's own button and card fields, drawn live by PayPal's SDK in the sandbox. They are shown, and not paid: this
     sandbox app does not have card payments switched on, so the purchase goes through a local method below. */
  await click(page.getByRole('radio', { name: /^PayPal/ }))
  mark('paypalSelected')
  const paypalButton = page.locator('paypal-button').first()
  await paypalButton.waitFor({ timeout: 30000 })
  await reveal(paypalButton, 'center')
  mark('paypalShown')
  await sleep(1300)
  await reveal(page.getByRole('radio', { name: /^Card/ }), 'center')
  await click(page.getByRole('radio', { name: /^Card/ }))
  mark('cardSelected')
  const cardFields = page.locator('paypal-hosted-card-field')
  await cardFields.nth(2).waitFor({ timeout: 30000 })
  await reveal(cardFields.nth(1), 'center')
  mark('cardShown')
  await sleep(1300)
  await reveal(page.getByRole('radio', { name: /^Mobile money/ }), 'center')

  /* a local method, simulated: the demo control approves it */
  await click(page.getByRole('radio', { name: /^Mobile money/ }))
  mark('localSelected')
  await sleep(500)
  await reveal(page.getByRole('button', { name: /^Pay / }), 'center')
  await sleep(500)
  const pay = page.getByRole('button', { name: /^Pay / })
  await click(pay)
  mark('payClicked')
  await page.getByRole('heading', { name: "You're in" }).waitFor({ timeout: 60000 })
  mark('paid')
  await sleep(2800)

  /* ---- The seller ----------------------------------------------------------------------------------------------- */
  console.log('seller')
  await click(page.getByRole('tab', { name: /^Seller/ }))
  mark('sellerTab')
  await sleep(2400)
  await click(side('Payments'))
  await page
    .getByRole('grid')
    .first()
    .waitFor({ timeout: 30000 })
    .catch(() => {})
  mark('payments')
  await sleep(2600)
  await click(side('Payouts'))
  mark('payouts')
  await sleep(1900)
  const payout = page.getByRole('button', { name: /Pay out now/ })
  if (await payout.count()) {
    await click(payout.first())
    mark('payoutClicked')
    await sleep(2800)
  }

  /* ---- The admin ------------------------------------------------------------------------------------------------ */
  console.log('admin')
  await click(page.getByRole('tab', { name: /^Admin/ }))
  mark('adminTab')
  await sleep(2800)
  await click(side('Risk review'))
  await page.getByRole('article').first().waitFor({ timeout: 30000 })
  mark('review')
  await sleep(2400)
  await moveTo(page.getByRole('button', { name: 'Approve' }).first(), { steps: 30 })
  mark('reviewHover')
  await sleep(1800)
  await click(side('Transactions'))
  await page
    .getByRole('grid')
    .first()
    .waitFor({ timeout: 30000 })
    .catch(() => {})
  mark('transactions')
  await sleep(2800)
  await click(side('Fairness'))
  mark('fairness')
  await sleep(1300)
  await click(page.getByRole('button', { name: /Score it from every country/ }))
  mark('fairnessRun')
  await page.getByRole('button', { name: /Run it again/ }).waitFor({ timeout: 60000 })
  mark('fairnessDone')
  await sleep(3200)

  /* ---- The copilot ---------------------------------------------------------------------------------------------- */
  console.log('copilot')
  await click(page.getByRole('tab', { name: /^Seller/ }))
  await sleep(700)
  await click(side('Copilot'))
  mark('copilot')
  await sleep(1800)
  const ask = page.getByPlaceholder('Ask about your business')
  await typeInto(ask, 'Which payment method works best in Ghana?', 48)
  mark('asked')
  await page.keyboard.press('Enter')
  await page.waitForResponse((response) => response.url().includes('/api/copilot/ask'), { timeout: 90000 })
  await sleep(2400)
  mark('answered')
  await typeInto(ask, 'Make a payment link for AI for Work that ends in 14 days', 42)
  mark('asked2')
  await page.keyboard.press('Enter')
  await page.waitForResponse((response) => response.url().includes('/api/copilot/ask'), { timeout: 90000 })
  await page.getByRole('button', { name: 'Confirm' }).waitFor({ timeout: 30000 })
  mark('proposal')
  await sleep(2400)
  /* the button sits under the floating input until it is scrolled clear of it: make sure a click would really reach it */
  const confirm = page.getByRole('button', { name: 'Confirm' })
  await reveal(confirm, 'center')
  await confirm.click({ trial: true, timeout: 8000 })
  mark('revealed')
  await sleep(500)
  await click(confirm)
  mark('confirmClicked')
  await sleep(3400)
  if (!(await page.locator('body').innerText()).includes('pronebridge.vercel.app/#/buyer/link/')) {
    throw new Error('the payment link does not show the public address')
  }
  mark('end')
} finally {
  await sleep(600)
  await cdp.send('Page.stopScreencast').catch(() => {})
  const first = frames[0]?.[0] ?? 0
  const meta = {
    width: Math.round(WIDTH * SCALE),
    height: Math.round(HEIGHT * SCALE),
    frames: frames.map(([time, file]) => [+(time - first).toFixed(4), file]),
    marks: Object.fromEntries(Object.entries(marks).map(([name, time]) => [name, +(time - first).toFixed(3)])),
  }
  writeFileSync(join(out, 'meta.json'), JSON.stringify(meta))
  const seconds = meta.frames.at(-1)?.[0] ?? 0
  console.log(`recorded ${frames.length} frames over ${seconds.toFixed(1)} s (${readdirSync(out).length - 1} files)`)
  await page.screenshot({ path: join(import.meta.dirname, '..', 'work', 'preview', 'record-last.png') }).catch(() => {})
  await browser.close()
}
