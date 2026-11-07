/* Small helpers shared by the scenes: easing, time ranges, and where a spoken word falls in a scene. */
export const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value))
export const lerp = (from, to, amount) => from + (to - from) * amount

/* How far through [from, to] the time is, from 0 to 1. */
export const prog = (time, from, to) => clamp((time - from) / (to - from))

export const ease = {
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  out: (x) => 1 - Math.pow(1 - x, 3),
  outExpo: (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  outBack: (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2),
  in: (x) => x * x * x,
}

/* A value that moves through keyframes: [[time, value], ...], eased between each pair. */
export function track(time, frames, curve = ease.inOut) {
  if (time <= frames[0][0]) return frames[0][1]
  for (let index = 1; index < frames.length; index += 1) {
    const [t1, v1] = frames[index]
    if (time <= t1) {
      const [t0, v0] = frames[index - 1]
      return lerp(v0, v1, curve(prog(time, t0, t1)))
    }
  }
  return frames.at(-1)[1]
}

const plain = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '')

/* When a word is first said in a scene, in seconds from the start of the scene. nth picks a later occurrence (0 is the first).
   Throws if the word is not there, so a change of script cannot silently break a cue. */
export function said(scene, word, nth = 0) {
  const wanted = plain(word)
  const found = scene.words.filter((entry) => plain(entry.text) === wanted)
  if (!found[nth]) throw new Error(`"${word}" (${nth}) is not said in ${scene.id}`)
  return found[nth].start
}

/* When the word ends. */
export function saidEnd(scene, word, nth = 0) {
  const wanted = plain(word)
  const found = scene.words.filter((entry) => plain(entry.text) === wanted)
  if (!found[nth]) throw new Error(`"${word}" (${nth}) is not said in ${scene.id}`)
  return found[nth].end
}

/* The ProneBridge mark, in its four parts: the bridge deck, the pillar and the two legs. Taken from brand/output/logo. */
export const MARK_PARTS = [
  'M200.5 0H473.5A71.5 71.5 0 0 1 473.5 143H200.5A71.5 71.5 0 0 1 200.5 0Z',
  'M263.5 293a73.5 73.5 0 1 0 147 0a73.5 73.5 0 1 0 -147 0Z',
  'M9.66 353.4L146.66 589.4A71.5 71.5 0 0 0 270.34 517.6L133.34 281.6A71.5 71.5 0 0 0 9.66 353.4Z',
  'M552.78 281.41L414.78 517.41A71.5 71.5 0 0 0 538.22 589.59L676.22 353.59A71.5 71.5 0 0 0 552.78 281.41Z',
]

/* The mark as an svg of the given height. Its parts are .p0 to .p3, so a scene can move each one. */
export function markNode(height, fill = '#0070e0') {
  const width = (height * 686) / 625
  const wrapper = document.createElement('div')
  wrapper.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 686 625" width="${width}" height="${height}" style="overflow:visible">${MARK_PARTS.map(
    (d, index) =>
      `<path class="p${index}" d="${d}" fill="${fill}" style="transform-box:fill-box;transform-origin:center"/>`,
  ).join('')}</svg>`
  return wrapper.firstElementChild
}

export function el(tag, className, html) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (html !== undefined) node.innerHTML = html
  return node
}

/* Sets a CSS transform and opacity in one go. */
export function place(node, { x = 0, y = 0, scale = 1, rotate = 0, opacity = 1 } = {}) {
  node.style.transform = `translate(${x}px, ${y}px) scale(${scale}) rotate(${rotate}deg)`
  node.style.opacity = String(opacity)
}

/* Waits for an image to be decoded, so a frame never shows a half loaded picture. */
export async function loaded(image) {
  if (image.complete && image.naturalWidth) return
  await image.decode().catch(() => {})
}

/* A small seeded random generator, so the film renders the same every time. */
export function random(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
