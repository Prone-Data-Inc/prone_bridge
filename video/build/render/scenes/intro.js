/* s03: ProneBridge. World payments on one side, local methods on the other, one checkout in the middle, and the vendors it
   serves below. Every element arrives on its word. Text only: no company logos, and the local methods say Simulated. */
import { clamp, ease, el, markNode, prog, said } from '../lib.js'

export default async function intro(root, { scene }) {
  root.style.background = 'linear-gradient(180deg, #fbfdff 0%, #e8f1fd 100%)'
  const glow = el('div')
  glow.style.cssText =
    'position:absolute;left:50%;top:420px;width:1300px;height:1300px;margin:-650px 0 0 -650px;border-radius:50%;background:radial-gradient(closest-side, rgba(0,112,224,.13), rgba(0,112,224,0))'
  root.append(glow)

  const at = {
    bridge: said(scene, 'built') - 0.1,
    checkout: said(scene, 'checkout'),
    world: said(scene, 'world'),
    paypal: said(scene, 'PayPal'),
    visa: said(scene, 'Visa'),
    master: said(scene, 'Mastercard'),
    local: said(scene, 'local', 0),
    mobile: said(scene, 'mobile'),
    bank: said(scene, 'bank'),
    ussd: said(scene, 'USSD'),
    vendor: said(scene, 'vendor'),
    shops: said(scene, 'Online'),
    learning: said(scene, 'learning'),
    software: said(scene, 'software'),
    demo: said(scene, 'demo'),
    simulated: said(scene, 'simulated'),
  }

  /* lines first, so the cards sit on top of them */
  const wires = el(
    'div',
    '',
    `<svg viewBox="0 0 1920 1080" width="1920" height="1080" style="position:absolute;inset:0" fill="none" stroke-width="3" stroke-linecap="round">
       <path id="w0" d="M570 368 C 680 368, 690 430, 760 452" stroke="#0070e0"/>
       <path id="w1" d="M570 468 C 680 468, 700 470, 760 470" stroke="#0070e0"/>
       <path id="w2" d="M570 568 C 680 568, 690 510, 760 488" stroke="#0070e0"/>
       <path id="w3" d="M1330 368 C 1240 368, 1230 430, 1160 452" stroke="#12a150"/>
       <path id="w4" d="M1330 468 C 1240 468, 1220 470, 1160 470" stroke="#12a150"/>
       <path id="w5" d="M1330 568 C 1240 568, 1230 510, 1160 488" stroke="#12a150"/>
       <path id="v0" d="M900 600 C 900 680, 520 690, 520 760" stroke="#0070e0"/>
       <path id="v1" d="M960 600 C 960 680, 960 690, 960 760" stroke="#0070e0"/>
       <path id="v2" d="M1020 600 C 1020 680, 1400 690, 1400 760" stroke="#0070e0"/>
     </svg>`,
  )
  const wire = (name) => wires.querySelector(`#${name}`)
  const wirePaths = Object.fromEntries(
    ['w0', 'w1', 'w2', 'w3', 'w4', 'w5', 'v0', 'v1', 'v2'].map((name) => [name, wire(name)]),
  )
  for (const path of Object.values(wirePaths)) {
    path.style.strokeDasharray = `${path.getTotalLength()}`
  }

  const heading = el('div', 'display', 'One checkout')
  heading.style.cssText =
    'position:absolute;left:0;right:0;top:70px;text-align:center;font-size:104px;line-height:1;color:#0b1b3f;letter-spacing:-0.03em'

  const hub = el('div')
  hub.style.cssText =
    'position:absolute;left:760px;top:350px;width:400px;height:250px;border-radius:30px;background:#fff;box-shadow:0 30px 80px rgba(0,112,224,.28), 0 0 0 2px rgba(0,112,224,.22);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px'
  const mark = markNode(86, '#0070e0')
  const name = el('div', 'display', 'ProneBridge')
  name.style.cssText = 'font-size:56px;line-height:1;color:#0b1b3f'
  hub.append(mark, name)

  const label = (text, x, y, color) => {
    const node = el('div', '', text)
    node.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:420px;font-size:25px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${color}`
    return node
  }
  const worldLabel = label('World payments', 150, 262, '#0070e0')
  const localLabel = label('Local payments', 1330, 262, '#12a150')
  const vendorLabel = label('For any vendor', 150, 690, '#4a5878')
  vendorLabel.style.cssText += ';width:1000px'

  const chip = (text, x, y, color, tag, width = 420) => {
    const node = el('div', '', `<span>${text}</span>${tag ? `<em>${tag}</em>` : ''}`)
    node.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${width}px;height:80px;border-radius:22px;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 26px;font-size:34px;font-weight:700;color:#0b1b3f;white-space:nowrap;box-shadow:0 14px 34px rgba(11,27,63,.12), inset 0 0 0 3px ${color}`
    const tagNode = node.querySelector('em')
    if (tagNode)
      tagNode.style.cssText =
        'font-style:normal;font-size:17px;font-weight:600;color:#0b6b36;background:#e3f6ea;border-radius:999px;padding:5px 13px'
    return node
  }
  const worldChips = [
    chip('PayPal', 150, 328, '#0070e0'),
    chip('Visa', 150, 428, '#0070e0'),
    chip('Mastercard', 150, 528, '#0070e0'),
  ]
  const localChips = [
    chip('Mobile money', 1330, 328, '#12a150', 'Simulated', 460),
    chip('Bank transfer', 1330, 428, '#12a150', 'Simulated', 460),
    chip('USSD', 1330, 528, '#12a150', 'Simulated', 460),
  ]
  const vendor = (text, x) => {
    const node = el('div', '', text)
    node.style.cssText = `position:absolute;left:${x}px;top:760px;width:380px;height:104px;border-radius:24px;background:#0b1b3f;color:#fff;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:700;letter-spacing:-0.01em;box-shadow:0 20px 50px rgba(11,27,63,.25)`
    return node
  }
  const vendors = [vendor('Online shops', 330), vendor('Learning platforms', 770), vendor('Software', 1210)]

  const demo = el('div', '', 'In this demo, local methods are simulated.')
  demo.style.cssText =
    'position:absolute;left:1330px;top:630px;width:460px;font-size:26px;font-weight:600;color:#0b6b36;line-height:1.25'

  /* the dots that travel along the wires, toward the checkout and on to the vendors */
  const dots = []
  const dotFor = (color) => {
    const node = el('div')
    node.style.cssText = `position:absolute;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:${color};box-shadow:0 0 18px ${color}`
    dots.push(node)
    return node
  }
  const travelers = [
    ['w0', at.paypal, '#0070e0'],
    ['w1', at.visa, '#0070e0'],
    ['w2', at.master, '#0070e0'],
    ['w3', at.mobile, '#12a150'],
    ['w4', at.bank, '#12a150'],
    ['w5', at.ussd, '#12a150'],
    ['v0', at.shops, '#0070e0'],
    ['v1', at.learning, '#0070e0'],
    ['v2', at.software, '#0070e0'],
  ].map(([path, start, color]) => ({ path: wirePaths[path], start, node: dotFor(color) }))

  root.append(
    wires,
    heading,
    hub,
    worldLabel,
    localLabel,
    vendorLabel,
    ...worldChips,
    ...localChips,
    ...vendors,
    demo,
    ...dots,
  )

  const rise = (node, from, dy = 30, dx = 0) => {
    const k = ease.outExpo(prog(from.t, from.at, from.at + 0.75))
    node.style.opacity = String(k)
    node.style.transform = `translate(${(1 - k) * dx}px, ${(1 - k) * dy}px)`
  }

  return {
    update(time) {
      const tt = (start) => ({ t: time, at: start })
      rise(heading, tt(at.checkout - 0.25), 36)

      /* the mark builds itself as the name is said */
      const hubK = ease.outBack(prog(time, at.bridge - 0.5, at.bridge + 0.4))
      hub.style.opacity = String(clamp(hubK))
      hub.style.transform = `scale(${0.9 + 0.1 * hubK})`
      ;[
        [0, { y: -50 }, 0.0],
        [1, { s: 0 }, 0.3],
        [2, { x: -50, y: 50 }, 0.12],
        [3, { x: 50, y: 50 }, 0.2],
      ].forEach(([index, from, delay]) => {
        const p = ease.outBack(prog(time, at.bridge - 0.4 + delay, at.bridge + 0.5 + delay))
        const node = mark.querySelector(`.p${index}`)
        node.style.transform = `translate(${(from.x ?? 0) * (1 - p)}px, ${(from.y ?? 0) * (1 - p)}px) scale(${from.s === undefined ? 1 : p})`
        node.style.opacity = String(clamp(p * 2))
      })

      rise(worldLabel, tt(at.world - 0.2), 20, -20)
      rise(localLabel, tt(at.local - 0.2), 20, 20)
      worldChips.forEach((node, index) => rise(node, tt([at.paypal, at.visa, at.master][index] - 0.3), 24, -50))
      localChips.forEach((node, index) => rise(node, tt([at.mobile, at.bank, at.ussd][index] - 0.3), 24, 50))
      rise(vendorLabel, tt(at.vendor - 0.2), 20)
      vendors.forEach((node, index) => rise(node, tt([at.shops, at.learning, at.software][index] - 0.3), 40))

      /* wires draw themselves from the chip to the checkout */
      Object.entries(wirePaths).forEach(([key, path], index) => {
        const start = travelers[index].start - 0.2
        const k = ease.inOut(prog(time, start, start + 0.7))
        path.style.strokeDashoffset = String(path.getTotalLength() * (1 - k))
        path.style.opacity = String(k ? 0.5 : 0)
        void key
      })

      /* dots flow along the wires once they are drawn */
      travelers.forEach(({ path, start, node }) => {
        const begin = start + 0.6
        if (time < begin) {
          node.style.opacity = '0'
          return
        }
        const period = 1.9
        const p = ((time - begin) % period) / period
        const point = path.getPointAtLength(path.getTotalLength() * ease.inOut(p))
        node.style.opacity = String(Math.sin(p * Math.PI))
        node.style.transform = `translate(${point.x}px, ${point.y}px)`
      })

      const demoK = ease.out(prog(time, at.demo - 0.2, at.demo + 0.6))
      demo.style.opacity = String(demoK)
      demo.style.transform = `translateY(${(1 - demoK) * 16}px)`
      /* the Simulated tags glow when the word is said */
      const glow =
        ease.inOut(prog(time, at.simulated - 0.2, at.simulated + 0.3)) *
        (1 - ease.inOut(prog(time, at.simulated + 0.9, at.simulated + 1.4)))
      localChips.forEach((chipNode) => {
        const tag = chipNode.querySelector('em')
        tag.style.boxShadow = `0 0 0 ${6 * glow}px rgba(18,161,80,${0.35 * glow})`
        tag.style.transform = `scale(${1 + 0.12 * glow})`
      })
    },
  }
}
