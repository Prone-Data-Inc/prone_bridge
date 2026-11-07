/* Puts recorded footage of the app in a window, and moves a camera over it. Two things make it feel edited and not
   recorded: the footage plays faster or slower between anchors (a moment of the recording is pinned to a moment of the
   narration), and the camera glides to what is being talked about. A pair of anchors with the same time is a cut. */
import { ease, el, loaded, prog, track } from './lib.js'

const meta = await (await fetch('/work/footage/meta.json')).json()
export const marks = meta.marks
const times = meta.frames.map(([time]) => time)
const files = meta.frames.map(([, file]) => file)
const lastTime = times.at(-1)

/* The frame shown at a moment of the recording: the last one painted by then. */
function frameAt(time) {
  const clamped = Math.min(Math.max(time, times[0]), lastTime)
  let low = 0
  let high = times.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (times[middle] <= clamped) low = middle
    else high = middle - 1
  }
  return files[low]
}

/* The file of the frame shown at a moment of the recording (for scenes that build their own window). */
export const frameFile = frameAt

/* Where in the recording a moment of the scene falls. anchors: [[sceneTime, recordingTime], ...]. */
export function warp(anchors, time) {
  if (time <= anchors[0][0]) return anchors[0][1] + (time - anchors[0][0])
  let index = anchors.length - 1
  while (index > 0 && anchors[index][0] > time) index -= 1
  const [t0, s0] = anchors[index]
  const next = anchors[index + 1]
  if (!next) return s0 + (time - t0)
  const [t1, s1] = next
  if (t1 === t0) return s0
  return s0 + ((s1 - s0) * (time - t0)) / (t1 - t0)
}

/* Prints how fast each stretch plays, to see if something runs too fast to follow. */
export function speeds(anchors) {
  const rows = []
  for (let index = 1; index < anchors.length; index += 1) {
    const [t0, s0] = anchors[index - 1]
    const [t1, s1] = anchors[index]
    if (t1 > t0) rows.push(`${t0.toFixed(1)}-${t1.toFixed(1)}: ${((s1 - s0) / (t1 - t0)).toFixed(2)}x`)
  }
  return rows.join('  ')
}

const WINDOW = { x: 168, y: 62, width: 1584, height: 860 }
const SOURCE = { width: 1568, height: 852 }
const K = WINDOW.width / SOURCE.width

/* label: [name, what it is]. anchors: see warp. camera: [[sceneTime, { cx, cy, s }], ...] with cx, cy in the pixels of
   the recorded page (1568 by 852) and s the zoom (1 shows it all). */
export function footageScene({
  id,
  label,
  anchors,
  camera,
  labels,
  note = 'Demo data. PayPal sandbox. Local payment methods are simulated.',
}) {
  return async (root) => {
    root.style.background = 'linear-gradient(180deg, #fbfdff 0%, #e9f1fd 100%)'
    const glow = el('div')
    glow.style.cssText =
      'position:absolute;left:-200px;top:-260px;width:1100px;height:1100px;border-radius:50%;background:radial-gradient(closest-side, rgba(0,112,224,.12), rgba(0,112,224,0))'
    root.append(glow)

    const frame = el('div')
    frame.style.cssText = `position:absolute;left:${WINDOW.x}px;top:${WINDOW.y}px;width:${WINDOW.width}px;height:${WINDOW.height}px;border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 34px 90px rgba(11,27,63,.24), 0 0 0 1px rgba(11,27,63,.1)`
    const image = document.createElement('img')
    image.style.cssText = `position:absolute;left:0;top:0;width:${WINDOW.width}px;height:${WINDOW.height}px;transform-origin:0 0;will-change:transform`
    frame.append(image)
    root.append(frame)

    const chip = el('div', '', '')
    chip.style.cssText =
      'position:absolute;left:168px;top:14px;height:36px;display:flex;align-items:center;gap:12px;font-size:21px;font-weight:600;color:#33415c'
    root.append(chip)
    const noteNode = el('div', 'note', note)
    noteNode.style.cssText += `;left:${WINDOW.x}px;top:${WINDOW.y + WINDOW.height + 10}px`
    root.append(noteNode)

    const labelAt = (time) => {
      let current = label
      for (const [from, value] of labels ?? []) if (time >= from) current = value
      return current
    }
    let shown = ''
    console.log(`${id} speeds: ${speeds(anchors)}`)

    return {
      async update(time) {
        const source = warp(anchors, time)
        const file = frameAt(source)
        if (image.dataset.file !== file) {
          image.dataset.file = file
          image.src = `/work/footage/${file}`
          await loaded(image)
          await image.decode().catch(() => {})
        }

        /* the camera */
        const pick = (key) =>
          track(
            time,
            camera.map(([at, view]) => [at, view[key]]),
            ease.inOut,
          )
        const s = pick('s')
        const cx = pick('cx')
        const cy = pick('cy')
        let tx = WINDOW.width / 2 - s * K * cx
        let ty = WINDOW.height / 2 - s * K * cy
        tx = Math.min(0, Math.max(WINDOW.width - s * WINDOW.width, tx))
        ty = Math.min(0, Math.max(WINDOW.height - s * WINDOW.height, ty))
        image.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`

        const [name, what] = labelAt(time)
        const text = `${name}|${what}`
        if (text !== shown) {
          shown = text
          chip.innerHTML = `<span style="background:#0070e0;color:#fff;border-radius:999px;padding:5px 16px;font-size:18px;letter-spacing:.08em;text-transform:uppercase">${name}</span><span>${what}</span>`
        }
        chip.style.opacity = String(ease.out(prog(time, 0.2, 0.8)))
      },
    }
  }
}
