/* s11: the close. The mark builds itself, the tagline, then "Thank you" in the ProneBridge blues, with the palette. */
import { ease, el, markNode, place, prog, said, track } from '../lib.js'

const PALETTE = [
  ['#0070E0', 'Blue'],
  ['#003087', 'Deep'],
  ['#009CDE', 'Sky'],
  ['#0B1B3F', 'Ink'],
  ['#4DA3FF', 'Light'],
]

export default async function end(root, { scene }) {
  root.style.background = 'linear-gradient(135deg, #003087 0%, #0070e0 58%, #009cde 100%)'

  /* soft light and two long arcs, a nod to a bridge */
  const glow = el('div')
  glow.style.cssText =
    'position:absolute;left:50%;top:44%;width:1500px;height:1500px;margin:-750px 0 0 -750px;border-radius:50%;background:radial-gradient(closest-side, rgba(255,255,255,.22), rgba(255,255,255,0));'
  const arcs = el(
    'div',
    '',
    `<svg viewBox="0 0 1920 1080" width="1920" height="1080" style="position:absolute;inset:0" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="2"><path d="M-120 860 C 420 330, 1500 330, 2040 860"/><path d="M-120 960 C 420 430, 1500 430, 2040 960" stroke="rgba(255,255,255,.09)"/></svg>`,
  )

  const mark = markNode(150, '#ffffff')
  const markBox = el('div')
  markBox.style.cssText = 'position:absolute;left:0;right:0;top:170px;display:flex;justify-content:center'
  markBox.append(mark)

  const tagline = el('div', 'display', 'One checkout for every African market.')
  tagline.style.cssText =
    'position:absolute;left:0;right:0;top:400px;text-align:center;color:#fff;font-size:92px;line-height:1.05'

  const thanks = el('div', 'display', 'Thank you')
  thanks.style.cssText =
    'position:absolute;left:0;right:0;top:330px;text-align:center;color:#fff;font-size:230px;line-height:1;letter-spacing:-0.035em'

  const sub = el('div', '', 'ProneBridge  ·  PayPal AI Hackathon  ·  pronebridge.vercel.app')
  sub.style.cssText =
    'position:absolute;left:0;right:0;top:620px;text-align:center;color:rgba(255,255,255,.86);font-size:36px;font-weight:500;letter-spacing:.01em'

  const palette = el('div')
  palette.style.cssText = 'position:absolute;left:0;right:0;top:760px;display:flex;justify-content:center;gap:18px'
  const chips = PALETTE.map(([hex, name]) => {
    const chip = el('div', '', `<b>${hex}</b><span>${name}</span>`)
    chip.style.cssText = `width:196px;height:104px;border-radius:20px;background:${hex};display:flex;flex-direction:column;justify-content:flex-end;padding:14px 18px;color:#fff;font-size:18px;line-height:1.25;box-shadow:0 14px 34px rgba(0,16,60,.28), inset 0 0 0 2px rgba(255,255,255,.28)`
    chip.querySelector('b').style.cssText = 'font-size:25px;font-weight:700;letter-spacing:.02em'
    chip.querySelector('span').style.cssText = 'opacity:.82;font-weight:500'
    palette.append(chip)
    return chip
  })

  root.append(glow, arcs, markBox, tagline, thanks, sub, palette)

  const thankAt = said(scene, 'Thank')
  const built = [0.25, 0.4, 0.55, 0.7]

  return {
    update(t) {
      /* the mark assembles: deck from above, legs from below, the pillar grows */
      const parts = [
        { from: { y: -120 }, delay: built[0] },
        { from: { scale: 0 }, delay: built[3] },
        { from: { x: -90, y: 90 }, delay: built[1] },
        { from: { x: 90, y: 90 }, delay: built[2] },
      ]
      parts.forEach((part, index) => {
        const p = ease.outBack(prog(t, part.delay, part.delay + 0.7))
        const node = mark.querySelector(`.p${index}`)
        const x = (part.from.x ?? 0) * (1 - p)
        const y = (part.from.y ?? 0) * (1 - p)
        const scale = part.from.scale === undefined ? 1 : p
        node.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
        node.style.opacity = String(Math.min(1, p * 2))
      })

      /* the tagline in, then out as the thanks arrive */
      const tIn = ease.out(prog(t, 0.9, 1.6))
      const tOut = ease.inOut(prog(t, thankAt - 0.55, thankAt - 0.05))
      place(tagline, { y: (1 - tIn) * 26 - tOut * 30, opacity: tIn * (1 - tOut) })

      /* the mark rises a little when the thanks arrive */
      markBox.style.transform = `translateY(${track(t, [
        [thankAt - 0.5, 0],
        [thankAt + 0.3, -70],
      ])}px) scale(${track(t, [
        [thankAt - 0.5, 1],
        [thankAt + 0.3, 0.72],
      ])})`

      const thanksIn = ease.outExpo(prog(t, thankAt - 0.1, thankAt + 0.8))
      place(thanks, { y: (1 - thanksIn) * 40 - 60, scale: 0.94 + 0.06 * thanksIn, opacity: thanksIn })
      place(sub, {
        y: -60 + (1 - ease.out(prog(t, thankAt + 0.45, thankAt + 1.1))) * 18,
        opacity: ease.out(prog(t, thankAt + 0.45, thankAt + 1.1)),
      })
      chips.forEach((chip, index) => {
        const p = ease.outExpo(prog(t, thankAt + 0.6 + index * 0.09, thankAt + 1.3 + index * 0.09))
        place(chip, { y: (1 - p) * 40, opacity: p })
      })
      palette.style.top = '700px'

      glow.style.opacity = String(0.7 + 0.3 * Math.sin(t * 0.9))
    },
  }
}
