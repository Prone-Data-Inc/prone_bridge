/* s02: why ProneBridge exists. Prone Data Learning's storefront, then the wall every seller hits in Africa: one payment
   integration for every country. Africa is drawn from the same map data as the first scene, and the integrations count
   up to 54 as the countries light one by one. */
import { clamp, ease, el, prog, random, said, track } from '../lib.js'
import { frameFile, marks as M } from '../footage.js'

const map = await (await fetch('/work/map.json')).json()
const africa = map.countries.filter((country) => country.region === 'africa')
const A = map.africa

const PALE = [214, 226, 244]
const BLUE = [0, 112, 224]
const mix = (a, b, k) => `rgb(${a.map((value, index) => Math.round(value + (b[index] - value) * k)).join(',')})`

export default async function problem(root, { scene }) {
  root.style.background = 'linear-gradient(180deg, #fbfdff 0%, #e9f1fd 100%)'

  /* the storefront, in the same window as the app scenes, then shrunk to the left */
  const frame = el('div')
  frame.style.cssText =
    'position:absolute;left:0;top:0;width:1584px;height:860px;border-radius:22px;overflow:hidden;background:#fff;transform-origin:0 0;box-shadow:0 34px 90px rgba(11,27,63,.24), 0 0 0 1px rgba(11,27,63,.1)'
  const image = document.createElement('img')
  image.src = `/work/footage/${frameFile(M.shop + 0.9)}`
  image.style.cssText = 'position:absolute;left:0;top:0;width:1584px;height:860px;transform-origin:0 0'
  frame.append(image)

  const tag = el('div', '', '<span>Prone Data Learning</span><i>AI and automation courses</i>')
  tag.style.cssText =
    'position:absolute;left:168px;top:14px;height:36px;display:flex;align-items:center;gap:14px;font-size:21px;font-weight:600;color:#33415c'
  tag.querySelector('span').style.cssText =
    'background:#12a150;color:#fff;border-radius:999px;padding:5px 16px;font-size:18px;letter-spacing:.06em;text-transform:uppercase'
  tag.querySelector('i').style.cssText = 'font-style:normal'

  /* Africa, country by country */
  const pad = 14
  const w = A.x1 - A.x0 + pad * 2
  const h = A.y1 - A.y0 + pad * 2
  const panel = el('div')
  const panelHeight = 760
  const panelWidth = Math.round((panelHeight * w) / h)
  panel.style.cssText = `position:absolute;left:${1380 - panelWidth / 2}px;top:140px;width:${panelWidth}px;height:${panelHeight}px`
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', `${A.x0 - pad} ${A.y0 - pad} ${w} ${h}`)
  svg.setAttribute('width', panelWidth)
  svg.setAttribute('height', panelHeight)
  svg.style.overflow = 'visible'
  const paths = africa.map((country) => {
    const node = document.createElementNS(ns, 'path')
    node.setAttribute('d', country.d)
    node.setAttribute('stroke', '#fff')
    node.setAttribute('stroke-width', '0.9')
    node.setAttribute('stroke-linejoin', 'round')
    svg.append(node)
    return node
  })
  panel.append(svg)

  const heading = el('div', 'display', 'One integration <span style="color:#0070e0">per country</span>')
  heading.style.cssText =
    'position:absolute;left:0;right:0;top:56px;text-align:center;font-size:72px;line-height:1;color:#0b1b3f;padding-left:480px'
  const counter = el('div', '', '<div class="display">0</div><div>integrations to build</div>')
  counter.style.cssText = 'position:absolute;left:96px;top:600px;color:#0b1b3f'
  counter.firstElementChild.style.cssText = 'font-size:210px;line-height:.95;color:#0070e0'
  counter.lastElementChild.style.cssText = 'font-size:38px;font-weight:600;color:#4a5878;margin-top:8px'

  root.append(frame, tag, panel, heading, counter)

  /* when each country lights: Nigeria first, on "One", then all the others on "every single country" */
  const rng = random(54)
  const first = africa.findIndex((country) => country.name === 'Nigeria')
  const others = africa.map((_, index) => index).filter((index) => index !== first)
  for (let index = others.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1))
    ;[others[index], others[swap]] = [others[swap], others[index]]
  }
  const t = {
    wall: said(scene, 'wall'),
    one: said(scene, 'One'),
    every: said(scene, 'every', 1),
    country: said(scene, 'country'),
  }
  const lightAt = new Map([[first, t.one]])
  others.forEach((index, order) =>
    lightAt.set(index, t.every - 0.1 + (order / others.length) * (t.country + 0.5 - t.every)),
  )
  /* 54 countries; the map also draws Western Sahara and Somaliland, which light up with them */
  const total = 54

  /* the window: large at first, then it steps aside to the left */
  const big = { x: 168, y: 62, s: 1 }
  const small = { x: 96, y: 168, s: 0.56 }

  return {
    update(time) {
      const move = ease.inOut(prog(time, t.wall - 0.7, t.wall + 0.7))
      const x = big.x + (small.x - big.x) * move
      const y = big.y + (small.y - big.y) * move
      const s = big.s + (small.s - big.s) * move
      frame.style.transform = `translate(${x}px, ${y}px) scale(${s})`
      /* a slow push into the storefront while it is the subject */
      const push = 1 + 0.07 * prog(time, 0, t.wall)
      image.style.transform = `scale(${push})`
      image.style.transformOrigin = '30% 38%'
      const intro = ease.out(prog(time, 0.1, 0.8))
      tag.style.opacity = String(intro * (1 - move))

      /* Africa fades in as the wall is mentioned, pale; countries then fill in blue */
      const panelIn = ease.out(prog(time, t.wall - 0.4, t.wall + 0.8))
      panel.style.opacity = String(panelIn)
      panel.style.transform = `translateX(${(1 - panelIn) * 60}px)`
      let lit = 0
      africa.forEach((_, index) => {
        const when = lightAt.get(index)
        const k = ease.out(prog(time, when, when + 0.35))
        if (k >= 0.99) lit += 1
        paths[index].style.fill = mix(PALE, BLUE, k)
      })
      const count = Math.min(
        total,
        Math.round(
          track(
            time,
            [
              [t.one - 0.01, 0],
              [t.one + 0.2, 1],
              [t.every - 0.1, 1],
              [t.country + 0.5, total],
            ],
            ease.inOut,
          ),
        ),
      )
      counter.firstElementChild.textContent = String(count)
      const counterIn = ease.outExpo(prog(time, t.one - 0.1, t.one + 0.6))
      counter.style.opacity = String(counterIn)
      counter.style.transform = `translateY(${(1 - counterIn) * 30}px)`
      const headIn = ease.outExpo(prog(time, t.one - 0.2, t.one + 0.7))
      heading.style.opacity = String(headIn)
      heading.style.transform = `translateY(${(1 - headIn) * 24}px)`
      void clamp
      void lit
    },
  }
}
