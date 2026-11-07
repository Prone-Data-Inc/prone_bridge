/* What surrounds the PayPal code: the opening title ("PayPal is the global rail") and the closing flow ("Everything settles
   in US dollars, so ... can pay a seller in Africa"). Dark theme, to sit with the code. Text only, no logos. */
import { clamp, ease, el, prog, said } from '../lib.js'

export async function paypalExtras(root, { scene }) {
  const at = {
    rail: said(scene, 'rail'),
    orders: said(scene, 'Orders'),
    everything: said(scene, 'Everything'),
    dollars: said(scene, 'dollars'),
    diaspora: said(scene, 'diaspora'),
    buyers: said(scene, 'buyers'),
    seller: said(scene, 'seller'),
    africa: said(scene, 'Africa'),
    method: said(scene, 'method'),
    trust: said(scene, 'trust'),
  }

  /* the opening */
  const title = el('div', 'display', 'PayPal')
  title.style.cssText =
    'position:absolute;left:0;right:0;top:300px;text-align:center;color:#fff;font-size:240px;line-height:1;letter-spacing:-0.04em'
  const sub = el('div', 'display', 'The global rail')
  sub.style.cssText =
    'position:absolute;left:0;right:0;top:580px;text-align:center;color:#7cc0ff;font-size:76px;line-height:1'
  const rail = el('div')
  rail.style.cssText =
    'position:absolute;left:260px;right:260px;top:720px;height:4px;border-radius:4px;background:rgba(124,192,255,.28);overflow:hidden'
  const streak = el('div')
  streak.style.cssText =
    'position:absolute;top:0;height:4px;width:320px;border-radius:4px;background:linear-gradient(90deg, rgba(124,192,255,0), #7cc0ff, rgba(124,192,255,0))'
  rail.append(streak)
  root.append(title, sub, rail)

  /* the closing flow */
  const headline = el('div', 'display', 'Everything settles in <span style="color:#7cc0ff">US dollars</span>')
  headline.style.cssText =
    'position:absolute;left:0;right:0;top:92px;text-align:center;color:#fff;font-size:84px;line-height:1.05'
  const card = (label, hint, x, y) => {
    const node = el(
      'div',
      '',
      `<div style="font-size:44px;font-weight:700;letter-spacing:-0.01em">${label}</div><div style="font-size:26px;color:#9fb2d8;margin-top:6px">${hint}</div>`,
    )
    node.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:470px;padding:28px 34px;border-radius:24px;background:#0d2149;color:#fff;box-shadow:0 0 0 1px rgba(120,160,255,.22), 0 24px 60px rgba(0,0,0,.35)`
    return node
  }
  const diaspora = card('The diaspora', 'Abroad, paying home', 150, 300)
  const buyers = card('International buyers', 'Anywhere in the world', 150, 500)
  const seller = card('A seller in Africa', 'Paid out in US dollars', 1300, 400)
  const hub = el('div', 'display', 'USD')
  hub.style.cssText =
    'position:absolute;left:810px;top:350px;width:300px;height:300px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:110px;color:#fff;background:radial-gradient(closest-side, #1a6fe0, #0a3d94);box-shadow:0 0 0 2px rgba(124,192,255,.5), 0 0 90px rgba(0,112,224,.55)'
  const hubLabel = el('div', '', 'PayPal')
  hubLabel.style.cssText =
    'position:absolute;left:810px;top:672px;width:300px;text-align:center;color:#7cc0ff;font-size:34px;font-weight:700;letter-spacing:.02em'
  const chips = el('div', '', '<span>Card</span><span>PayPal</span>')
  chips.style.cssText = 'position:absolute;left:150px;top:690px;width:470px;display:flex;gap:16px'
  chips.querySelectorAll('span').forEach((chip) => {
    chip.style.cssText =
      'padding:12px 26px;border-radius:999px;background:rgba(77,163,255,.16);color:#cfe3ff;font-size:28px;font-weight:600;box-shadow:inset 0 0 0 2px rgba(124,192,255,.4)'
  })
  const trust = el('div', '', 'Methods they already trust')
  trust.style.cssText =
    'position:absolute;left:150px;top:770px;width:470px;color:#9fb2d8;font-size:26px;font-weight:500'

  const lines = el(
    'div',
    '',
    `<svg viewBox="0 0 1920 1080" width="1920" height="1080" style="position:absolute;inset:0" fill="none" stroke="rgba(124,192,255,.4)" stroke-width="3">
       <path id="a1" d="M620 360 C 720 360, 740 440, 810 480"/>
       <path id="a2" d="M620 560 C 720 560, 740 540, 810 530"/>
       <path id="a3" d="M1110 500 C 1200 500, 1230 500, 1300 500"/>
     </svg>`,
  )
  const tokens = []
  for (let index = 0; index < 9; index += 1) {
    const dot = el('div', '', '$')
    dot.style.cssText =
      'position:absolute;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:#7cc0ff;color:#08142f;font-weight:800;font-size:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 24px rgba(124,192,255,.8)'
    tokens.push(dot)
  }
  root.append(headline, lines, diaspora, buyers, seller, hub, hubLabel, chips, trust, ...tokens)
  const paths = ['a1', 'a2', 'a3'].map((name) => lines.querySelector(`#${name}`))

  const flow = (t, started, pathIndex, offset, period) => {
    if (t < started) return null
    const p = ((((t - started + offset) % period) + period) % period) / period
    const path = paths[pathIndex]
    const point = path.getPointAtLength(path.getTotalLength() * ease.inOut(p))
    return { x: point.x, y: point.y, a: Math.sin(p * Math.PI) }
  }

  return {
    update(t) {
      /* opening: shown until the first excerpt arrives */
      const openingOut = 1 - ease.inOut(prog(t, at.orders - 0.55, at.orders - 0.1))
      const titleIn = ease.outExpo(prog(t, 0.15, 1.0))
      title.style.opacity = String(titleIn * openingOut)
      title.style.transform = `translateY(${(1 - titleIn) * 40}px) scale(${0.96 + 0.04 * titleIn})`
      const subIn = ease.out(prog(t, at.rail - 0.5, at.rail + 0.2))
      sub.style.opacity = String(subIn * openingOut)
      sub.style.transform = `translateY(${(1 - subIn) * 20}px)`
      rail.style.opacity = String(ease.out(prog(t, 0.4, 1.0)) * openingOut)
      streak.style.left = `${-320 + ((t * 760) % 1900)}px`

      /* closing: the flow in US dollars */
      const fade = (from) => ease.outExpo(prog(t, from, from + 0.8))
      headline.style.opacity = String(fade(at.everything - 0.1))
      headline.style.transform = `translateY(${(1 - fade(at.everything - 0.1)) * 30}px)`
      const put = (node, from, dx = 0) => {
        const k = fade(from)
        node.style.opacity = String(k)
        node.style.transform = `translate(${(1 - k) * dx}px, ${(1 - k) * 26}px)`
      }
      put(hub, at.dollars - 0.5)
      put(hubLabel, at.dollars - 0.3)
      put(diaspora, at.diaspora - 0.3, -40)
      put(buyers, at.buyers - 0.3, -40)
      put(seller, at.seller - 0.3, 40)
      put(chips, at.method - 0.4)
      put(trust, at.method - 0.2)
      lines.style.opacity = String(fade(at.diaspora))
      const pulse = 1 + 0.04 * Math.sin(t * 3) * ease.out(prog(t, at.trust - 0.2, at.trust + 0.6))
      chips.style.transform += ` scale(${pulse})`

      /* dollars moving along the arrows */
      const live = [
        flow(t, at.diaspora + 0.2, 0, 0, 2.2),
        flow(t, at.diaspora + 0.2, 0, 1.1, 2.2),
        flow(t, at.buyers + 0.2, 1, 0.3, 2.2),
        flow(t, at.buyers + 0.2, 1, 1.4, 2.2),
        flow(t, at.seller + 0.1, 2, 0, 1.8),
        flow(t, at.seller + 0.1, 2, 0.9, 1.8),
        null,
        null,
        null,
      ]
      tokens.forEach((token, index) => {
        const point = live[index]
        if (!point) {
          token.style.opacity = '0'
          return
        }
        token.style.opacity = String(clamp(point.a * 1.6))
        token.style.transform = `translate(${point.x}px, ${point.y}px)`
      })
      void at.africa
    },
  }
}
