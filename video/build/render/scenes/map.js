/* s01: the world map. Card and PayPal payments light up Europe, the Americas and Asia, then the camera finds Africa.
   Every tier on this map is an ESTIMATE for illustration, and the picture says so. The cues follow the spoken words. */
import { clamp, ease, el, prog, said, track } from '../lib.js'

const map = await (await fetch('/work/map.json')).json()

const UNLIT = '#e1eaf7'
const TIER = { 0: '#cdd5e2', 1: '#c6dcf6', 2: '#62a9f0', 3: '#0070e0', 4: '#003087' }
const SKY = '#009cde'
const GREEN = '#12a150'
const NETWORKS = ['#0070e0', '#009cde', '#7a5ad6']
const RATIO = 1.8

const rgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))
const mix = (from, to, amount) => {
  const a = rgb(from)
  const b = rgb(to)
  return `rgb(${a.map((value, index) => Math.round(value + (b[index] - value) * amount)).join(',')})`
}

export default async function mapScene(root, { scene }) {
  root.style.background = 'linear-gradient(180deg, #fbfdff 0%, #eaf2ff 100%)'

  /* the title */
  const titleA = el(
    'div',
    'display',
    'Where Visa, Mastercard and <span style="color:#0070e0">PayPal</span> payments flow',
  )
  titleA.style.cssText =
    'position:absolute;left:96px;top:58px;font-size:56px;line-height:1.08;color:#0b1b3f;white-space:nowrap'
  const subA = el('div', '', 'Estimated intensity of online payments, by country')
  subA.style.cssText = 'position:absolute;left:98px;top:132px;font-size:26px;font-weight:500;color:#4a5878'
  const titleB = el(
    'div',
    'display',
    'Africa: fewer cards, more <span style="color:#12a150">mobile money</span> and cash',
  )
  titleB.style.cssText =
    'position:absolute;left:96px;top:58px;font-size:56px;line-height:1.08;color:#0b1b3f;white-space:nowrap'
  const subB = el('div', '', 'Estimated, for illustration')
  subB.style.cssText = 'position:absolute;left:98px;top:132px;font-size:26px;font-weight:500;color:#4a5878'

  /* the legend */
  const legend = el(
    'div',
    '',
    `<div style="display:flex;gap:26px;align-items:center;justify-content:flex-end;font-size:23px;font-weight:600;color:#33415c">
       <span><i style="background:${NETWORKS[0]}"></i>Visa</span><span><i style="background:${NETWORKS[1]}"></i>Mastercard</span><span><i style="background:${NETWORKS[2]}"></i>PayPal</span>
     </div>
     <div style="display:flex;gap:10px;align-items:center;justify-content:flex-end;margin-top:18px;font-size:20px;font-weight:500;color:#4a5878">
       Fewer<span style="display:flex;gap:4px"><b style="background:${TIER[1]}"></b><b style="background:${TIER[2]}"></b><b style="background:${TIER[3]}"></b><b style="background:${TIER[4]}"></b></span>More payments
     </div>`,
  )
  legend.style.cssText = 'position:absolute;right:96px;top:66px;text-align:right'
  legend.insertAdjacentHTML(
    'beforeend',
    '<style>#s01_map i{display:inline-block;width:16px;height:16px;border-radius:50%;margin-right:9px;vertical-align:-2px}#s01_map b{display:block;width:34px;height:14px;border-radius:4px}</style>',
  )

  /* the map: shapes in svg, pulses and flows on a canvas above, both moved together by the camera */
  const box = el('div')
  box.style.cssText = `position:absolute;left:210px;top:180px;width:${map.width}px;height:${map.height}px;transform-origin:0 0`
  const svgNS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${map.width} ${map.height}`)
  svg.setAttribute('width', map.width)
  svg.setAttribute('height', map.height)
  svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible'
  const paths = map.countries.map((country) => {
    const node = document.createElementNS(svgNS, 'path')
    node.setAttribute('d', country.d)
    node.setAttribute('stroke', '#ffffff')
    node.setAttribute('stroke-width', '0.7')
    node.setAttribute('stroke-linejoin', 'round')
    svg.append(node)
    return node
  })
  const africaGlow = document.createElementNS(svgNS, 'g')
  svg.append(africaGlow)
  const canvas = document.createElement('canvas')
  canvas.width = map.width * RATIO
  canvas.height = map.height * RATIO
  canvas.style.cssText = `position:absolute;left:0;top:0;width:${map.width}px;height:${map.height}px`
  const ctx = canvas.getContext('2d')
  box.append(svg, canvas)

  /* what is said about Africa */
  const stat = (top, label) => {
    const node = el(
      'div',
      '',
      `<div class="display" style="font-size:150px;line-height:1;color:#0b1b3f"></div><div style="font-size:32px;font-weight:600;color:#4a5878;margin-top:4px">${label}</div>`,
    )
    node.style.cssText = `position:absolute;left:96px;top:${top}px`
    return node
  }
  const statCountries = stat(246, 'countries')
  const statPeople = stat(436, 'people')
  const cardBox = el(
    'div',
    '',
    `<div style="position:relative;width:230px;height:144px;border-radius:20px;background:linear-gradient(135deg,#0b1b3f,#003087);box-shadow:0 18px 40px rgba(11,27,63,.25)">
       <div style="position:absolute;left:0;right:0;top:30px;height:26px;background:rgba(255,255,255,.25)"></div>
       <div style="position:absolute;left:22px;top:84px;width:46px;height:34px;border-radius:7px;background:#e6c46a"></div>
       <div class="strike" style="position:absolute;left:-18px;top:68px;height:9px;border-radius:6px;background:#d63f4a;transform-origin:0 50%;transform:rotate(-24deg);width:0"></div>
     </div>
     <div style="font-size:30px;font-weight:600;color:#4a5878;margin-top:16px">A card form alone</div>`,
  )
  cardBox.style.cssText = 'position:absolute;left:96px;top:664px'
  const strike = cardBox.querySelector('.strike')

  const chip = (text, top) => {
    const node = el(
      'div',
      '',
      `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${GREEN};margin-right:12px"></span>${text}`,
    )
    node.style.cssText = `position:absolute;right:96px;top:${top}px;padding:16px 26px;border-radius:999px;background:#fff;color:#0b1b3f;font-size:32px;font-weight:700;box-shadow:0 12px 30px rgba(11,27,63,.14), inset 0 0 0 2px #cdeedb`
    return node
  }
  const chipMobile = chip('Mobile money', 360)
  const chipCash = chip('Cash', 468)

  const note = el('div', 'note', 'Estimated, for illustration. Not official data.')
  note.style.cssText += ';left:96px;top:894px;font-size:22px;color:#6b7a99'

  root.append(box, titleA, subA, titleB, subB, legend, statCountries, statPeople, cardBox, chipMobile, chipCash, note)

  /* cues, in seconds from the start of the scene */
  const at = {
    europe: said(scene, 'Europe'),
    americas: said(scene, 'Americas'),
    asia: said(scene, 'Asia'),
    africa: said(scene, 'Africa'),
    countries: said(scene, 'Fifty-four'),
    people: said(scene, 'more'),
    mobile: said(scene, 'mobile'),
    cash: said(scene, 'cash'),
    card: said(scene, 'card'),
    misses: said(scene, 'misses'),
  }
  /* the world lights up as it is named; before that, everything is pale */
  const lights = { europe: at.europe - 0.1, americas: at.americas - 0.1, asia: at.asia - 0.1 }
  const lit = (region, t) => {
    if (region === 'africa') return 1
    return ease.out(prog(t, lights[region], lights[region] + 0.9))
  }

  /* the camera: a slow drift over the world, then a glide to Africa */
  const A = map.africa
  const centerX = (A.x0 + A.x1) / 2
  const centerY = (A.y0 + A.y1) / 2
  const focus = 1.62
  const camera = (t) => {
    const k = ease.inOut(prog(t, at.africa - 0.35, at.africa + 1.45))
    const drift = 1 + 0.035 * prog(t, 0, at.africa)
    const scale = drift + (focus - drift) * k
    const worldX = map.width / 2
    const worldY = map.height / 2
    /* keep the middle of the world still, then move Africa to the right of the stage */
    const fromX = 0 - (scale - 1) * worldX
    const fromY = 0 - (scale - 1) * worldY
    const toX = 1240 - 210 - focus * centerX
    const toY = 560 - 180 - focus * centerY
    const x = fromX + (toX - fromX) * k
    const y = fromY + (toY - fromY) * k
    return { scale, x, y }
  }

  const stage = (t) => {
    /* flows between hubs, as dots along curves */
    ctx.setTransform(RATIO, 0, 0, RATIO, 0, 0)
    ctx.clearRect(0, 0, map.width, map.height)
  }

  const bezier = (a, b, lift, p) => {
    const mx = (a[0] + b[0]) / 2
    const my = (a[1] + b[1]) / 2
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const length = Math.hypot(dx, dy)
    const cx = mx - (dy / length) * length * lift
    const cy = my + (dx / length) * length * lift - length * 0.12
    const q = 1 - p
    return [q * q * a[0] + 2 * q * p * cx + p * p * b[0], q * q * a[1] + 2 * q * p * cy + p * p * b[1]]
  }

  return {
    update(t) {
      /* colors of the countries */
      const k = ease.inOut(prog(t, at.africa - 0.2, at.africa + 1.0))
      const africaK = ease.out(prog(t, at.africa + 0.35, at.africa + 1.2))
      map.countries.forEach((country, index) => {
        const node = paths[index]
        if (country.region === 'africa') {
          node.style.fill = mix(TIER[1], SKY, africaK)
          node.style.opacity = '1'
        } else {
          node.style.fill = mix(UNLIT, TIER[country.tier], lit(country.region, t))
          node.style.opacity = String(1 - 0.72 * k)
        }
      })
      svg.style.filter =
        africaK > 0.01 ? `drop-shadow(0 0 ${22 * africaK}px rgba(0,156,222,${0.45 * africaK}))` : 'none'

      /* pulses */
      stage(t)
      for (const point of map.points) {
        const isAfrica = point.region === 'africa'
        const strength = isAfrica
          ? ease.out(prog(t, at.africa + 0.6, at.africa + 1.4))
          : lit(point.region, t) * (1 - 0.8 * k)
        if (strength <= 0.01) continue
        const cycle = ((t + point.phase) % point.period) / point.period
        const color = isAfrica ? (t >= at.mobile - 0.2 ? GREEN : SKY) : NETWORKS[point.net]
        const radius = point.size * (0.4 + 2.3 * cycle) * (isAfrica ? 1.35 : 1)
        ctx.beginPath()
        ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
        ctx.strokeStyle = color
        ctx.globalAlpha = Math.pow(1 - cycle, 1.6) * 0.55 * strength
        ctx.lineWidth = 1.6
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(point.x, point.y, isAfrica ? 3 : 2.2, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.globalAlpha = 0.9 * strength
        ctx.fill()
      }

      /* flows between hubs */
      const flowIn = ease.out(prog(t, at.europe + 0.4, at.europe + 1.6)) * (1 - 0.85 * k)
      if (flowIn > 0.01) {
        map.arcs.forEach((arc, index) => {
          const period = 3.4 + (index % 3) * 0.5
          const p = ((((t - index * 0.55) % period) + period) % period) / period
          const eased = ease.inOut(p)
          const lift = index % 2 ? 0.2 : -0.2
          ctx.lineCap = 'round'
          for (let step = 0; step < 14; step += 1) {
            const from = clamp(eased - 0.28 + (step / 14) * 0.28, 0, 1)
            const to = clamp(eased - 0.28 + ((step + 1) / 14) * 0.28, 0, 1)
            if (to <= from) continue
            const a = bezier(arc.a, arc.b, lift, from)
            const b = bezier(arc.a, arc.b, lift, to)
            ctx.beginPath()
            ctx.moveTo(a[0], a[1])
            ctx.lineTo(b[0], b[1])
            ctx.strokeStyle = NETWORKS[index % 3]
            ctx.lineWidth = 2.6
            ctx.globalAlpha = (step / 14) * 0.85 * flowIn * (p < 0.04 || p > 0.96 ? 0.4 : 1)
            ctx.stroke()
          }
          const head = bezier(arc.a, arc.b, lift, eased)
          ctx.beginPath()
          ctx.arc(head[0], head[1], 4.2, 0, Math.PI * 2)
          ctx.fillStyle = NETWORKS[index % 3]
          ctx.globalAlpha = flowIn
          ctx.fill()
        })
      }
      ctx.globalAlpha = 1

      /* camera */
      const view = camera(t)
      box.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`

      /* titles */
      const swap = ease.inOut(prog(t, at.africa - 0.3, at.africa + 0.5))
      titleA.style.opacity = String(1 - swap)
      subA.style.opacity = String(1 - swap)
      titleB.style.opacity = String(swap)
      subB.style.opacity = String(swap)
      titleA.style.transform = `translateY(${-14 * swap}px)`
      titleB.style.transform = `translateY(${14 * (1 - swap)}px)`
      const intro = ease.out(prog(t, 0.1, 0.9))
      titleA.style.opacity = String((1 - swap) * intro)
      subA.style.opacity = String((1 - swap) * intro)
      legend.style.opacity = String(intro * (1 - 0.7 * swap))

      /* numbers */
      const countIn = ease.outExpo(prog(t, at.countries - 0.1, at.countries + 0.7))
      statCountries.firstElementChild.textContent = String(
        Math.round(54 * ease.out(prog(t, at.countries - 0.1, at.countries + 1.1))),
      )
      statCountries.style.opacity = String(countIn)
      statCountries.style.transform = `translateY(${(1 - countIn) * 30}px)`
      const peopleIn = ease.outExpo(prog(t, at.people - 0.1, at.people + 0.7))
      statPeople.firstElementChild.textContent = '1B+'
      statPeople.style.opacity = String(peopleIn)
      statPeople.style.transform = `translateY(${(1 - peopleIn) * 30}px)`

      const mobileIn = ease.outBack(prog(t, at.mobile - 0.1, at.mobile + 0.6))
      chipMobile.style.opacity = String(clamp(mobileIn))
      chipMobile.style.transform = `translateX(${(1 - mobileIn) * 60}px)`
      const cashIn = ease.outBack(prog(t, at.cash - 0.1, at.cash + 0.6))
      chipCash.style.opacity = String(clamp(cashIn))
      chipCash.style.transform = `translateX(${(1 - cashIn) * 60}px)`

      const cardIn = ease.outExpo(prog(t, at.card - 0.15, at.card + 0.6))
      cardBox.style.opacity = String(cardIn)
      cardBox.style.transform = `translateY(${(1 - cardIn) * 30}px)`
      const struck = ease.inOut(prog(t, at.misses - 0.1, at.misses + 0.5))
      strike.style.width = `${278 * struck}px`
      cardBox.firstElementChild.style.filter = `grayscale(${struck * 0.9})`
      cardBox.firstElementChild.style.opacity = String(1 - 0.35 * struck)

      note.style.opacity = String(ease.out(prog(t, 0.5, 1.2)))
      void track
    },
  }
}
