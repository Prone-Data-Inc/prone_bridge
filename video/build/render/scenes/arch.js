/* s08: the architecture diagram of the README, walked through box by box. The camera glides to each part as it is named,
   and a spotlight dims the rest. The diagram is the real docs/architecture.svg. */
import { clamp, ease, el, prog, said, track } from '../lib.js'

const CARD = { x: 210, y: 30, width: 1500, height: 928 }
const K = CARD.width / 1600

/* boxes of the diagram, in its own units: [x, y, width, height] */
const BOX = {
  api: [520, 150, 600, 700],
  web: [48, 150, 380, 700],
  tabs: [48, 150, 380, 150],
  services: [1220, 150, 332, 700],
  paypal: [1220, 650, 332, 200],
  openai: [1220, 390, 332, 220],
  supabase: [1220, 150, 332, 200],
}

const view = (name, margin = 1.3, cap = 2.3) => {
  const [x, y, w, h] = BOX[name]
  return {
    cx: x + w / 2,
    cy: y + h / 2,
    s: Math.min(CARD.width / (w * K * margin), CARD.height / (h * K * margin), cap),
    box: BOX[name],
  }
}

export default async function arch(root, { scene }) {
  root.style.background = 'linear-gradient(180deg, #fbfdff 0%, #e9f1fd 100%)'

  const card = el('div')
  card.style.cssText = `position:absolute;left:${CARD.x}px;top:${CARD.y}px;width:${CARD.width}px;height:${CARD.height}px;border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 34px 90px rgba(11,27,63,.22), 0 0 0 1px rgba(11,27,63,.1)`
  const inner = el('div')
  inner.style.cssText = `position:absolute;left:0;top:0;width:${CARD.width}px;height:${CARD.height}px;transform-origin:0 0;will-change:transform`
  const image = document.createElement('img')
  image.src = '/repo/docs/architecture.svg'
  image.style.cssText = `position:absolute;left:0;top:0;width:${CARD.width}px;height:${CARD.height}px`
  const spot = el('div')
  spot.style.cssText = 'position:absolute;border-radius:22px;pointer-events:none'
  inner.append(image, spot)
  card.append(inner)
  root.append(card)
  await image.decode().catch(() => {})

  const t = {
    api: said(scene, 'API') - 0.25,
    tabs: said(scene, 'tabs') - 0.45,
    services: said(scene, 'services') - 0.5,
    paypal: said(scene, 'PayPal') - 0.35,
    openai: said(scene, 'OpenAI') - 0.35,
    supabase: said(scene, 'Supabase') - 0.35,
    end: said(scene, 'data') + 0.7,
  }
  const FULL = { cx: 800, cy: 495, s: 1, box: null }
  /* the stops of the walk: when the camera arrives, and where */
  const stops = [
    [0, FULL],
    [t.api - 0.2, FULL],
    [t.api + 0.5, view('api', 1.15)],
    [t.tabs - 0.1, view('api', 1.15)],
    [t.tabs + 0.5, view('tabs', 1.5, 1.9)],
    [t.services - 0.1, view('tabs', 1.5, 1.9)],
    [t.services + 0.6, view('services', 1.1)],
    [t.paypal - 0.1, view('services', 1.1)],
    [t.paypal + 0.6, view('paypal', 1.25)],
    [t.openai - 0.1, view('paypal', 1.25)],
    [t.openai + 0.6, view('openai', 1.25)],
    [t.supabase - 0.1, view('openai', 1.25)],
    [t.supabase + 0.6, view('supabase', 1.25)],
    [t.end - 0.1, view('supabase', 1.25)],
    [t.end + 0.9, FULL],
  ]

  return {
    update(time) {
      const pick = (key) =>
        track(
          time,
          stops.map(([at, v]) => [at, v[key]]),
          ease.inOut,
        )
      const s = pick('s')
      const cx = pick('cx')
      const cy = pick('cy')
      let tx = CARD.width / 2 - s * K * cx
      let ty = CARD.height / 2 - s * K * cy
      tx = Math.min(0, Math.max(CARD.width - s * CARD.width, tx))
      ty = Math.min(0, Math.max(CARD.height - s * CARD.height, ty))
      inner.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`

      /* the spotlight follows the stop that is reached, and is off while the whole diagram shows */
      let index = 0
      while (index < stops.length - 1 && stops[index + 1][0] <= time) index += 1
      const [t0, v0] = stops[index]
      const next = stops[index + 1]
      let box = null
      let strength = 0
      if (!next) {
        box = v0.box
        strength = v0.box ? 1 : 0
      } else {
        const k = ease.inOut(prog(time, t0, next[0]))
        const from = v0.box
        const upto = next[1].box
        if (from && upto) {
          box = from.map((value, at) => value + (upto[at] - value) * k)
          strength = 1
        } else if (upto) {
          box = upto
          strength = k
        } else if (from) {
          box = from
          strength = 1 - k
        }
      }
      const [x, y, w, h] = box ?? [0, 0, 0, 0]
      spot.style.left = `${x * K}px`
      spot.style.top = `${y * K}px`
      spot.style.width = `${w * K}px`
      spot.style.height = `${h * K}px`
      spot.style.opacity = String(clamp(strength))
      spot.style.boxShadow =
        '0 0 0 6000px rgba(246,249,255,0.80), 0 0 0 6px rgba(0,112,224,.9), 0 0 60px rgba(0,112,224,.55)'
    },
  }
}
