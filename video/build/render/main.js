/* The compositor. window.seek(t) draws the film at time t, in seconds, and answers when the picture is ready.
   The renderer calls it once for every frame, so the film does not depend on how fast the machine is. */
import { clamp } from './lib.js'
import { scenes as registry } from './scenes/index.js'

const timeline = await (await fetch('/work/timeline.json')).json()
const layer = document.getElementById('scenes')
const captions = document.querySelector('#captions span')

const live = []
for (const entry of timeline.scenes) {
  const root = document.createElement('section')
  root.className = 'scene'
  root.id = entry.id
  root.style.display = 'none'
  layer.append(root)
  const make = registry[entry.id]
  if (!make) throw new Error(`no scene for ${entry.id}`)
  const instance = await make(root, { scene: entry, timeline })
  live.push({ entry, root, instance })
}
await document.fonts.ready

const caption = (time) => {
  let text = ''
  let opacity = 0
  for (const entry of timeline.scenes) {
    for (const chunk of entry.chunks) {
      const from = entry.start + chunk.start
      const to = entry.start + chunk.end
      if (time >= from && time < to) {
        text = chunk.text
        opacity = Math.min(clamp((time - from) / 0.12), clamp((to - time) / 0.12))
      }
    }
  }
  captions.textContent = text
  captions.parentElement.style.opacity = String(opacity)
  captions.style.visibility = text ? 'visible' : 'hidden'
}

window.seek = async (time) => {
  const jobs = []
  for (let index = 0; index < live.length; index += 1) {
    const { entry, root, instance } = live[index]
    const local = time - entry.start
    const next = live[index + 1]
    /* a scene is shown from its start until the next one has fully faded in over it */
    const covered = next && time >= next.entry.start + timeline.overlap
    const visible = local >= 0 && local < entry.duration && !covered
    root.style.display = visible ? 'block' : 'none'
    if (!visible) continue
    root.style.opacity = String(index === 0 ? 1 : clamp(local / timeline.overlap))
    jobs.push(instance.update(local, { time, scene: entry, timeline }))
  }
  await Promise.all(jobs)
  caption(time)
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  return true
}

window.filmReady = true
