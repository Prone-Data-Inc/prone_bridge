/* The code shots. A scene shows real excerpts of the repository (see buildcode.mjs) in an editor, one panel after another.
   Lines type in quickly, and a highlight band lights the lines that the narration is talking about, dimming the rest.
   panels: (scene) => [{ key, from, to, badge: [route, label], highlights: [{ lines: [a, b], at, until }] }], with times
   in seconds from the start of the scene and line numbers as in the file. */
import { clamp, ease, el, prog } from '../lib.js'

const code = await (await fetch('/work/code.json')).json()

const BG = 'linear-gradient(160deg, #0b1b3f 0%, #08142f 55%, #061027 100%)'
const WINDOW = { x: 150, y: 74, width: 1620 }

export function codeScene({ id, panels, extras }) {
  return async (root, { scene }) => {
    root.style.background = BG
    const glow = el('div')
    glow.style.cssText =
      'position:absolute;right:-300px;top:-300px;width:1200px;height:1200px;border-radius:50%;background:radial-gradient(closest-side, rgba(77,163,255,.20), rgba(77,163,255,0))'
    root.append(glow)

    const list = panels(scene).map((panel) => {
      const excerpt = code[panel.key]
      const rows = excerpt.lines
      const longest = Math.max(...rows.filter((row) => !row.gap).map((row) => row.plain.length))
      const fontSize = Math.max(20, Math.min(25, Math.floor(1470 / (longest * 0.6))))
      const lineHeight = Math.round(fontSize * 1.52)

      const box = el('div')
      const height = 64 + rows.length * lineHeight + 40
      /* the whole panel is a little larger than life, so the code is easy to read, and never reaches the captions */
      const zoom = Math.min(1.14, 880 / height)
      box.style.cssText = `position:absolute;left:${WINDOW.x}px;top:${Math.round(WINDOW.y + (860 - height) / 2)}px;width:${WINDOW.width}px;height:${height}px;transform-origin:50% 50%;border-radius:20px;background:#0d2149;box-shadow:0 40px 100px rgba(0,0,0,.45), 0 0 0 1px rgba(120,160,255,.18);overflow:hidden;opacity:0`
      const bar = el(
        'div',
        '',
        `<span style="display:flex;gap:9px"><i style="background:#ff6b6b"></i><i style="background:#ffd479"></i><i style="background:#5ee0a0"></i></span>
         <span class="file">${excerpt.file.replaceAll('/', ' / ')}</span>
         <span class="badge"><b>${panel.badge[0]}</b>${panel.badge[1]}</span>`,
      )
      bar.style.cssText =
        'height:64px;display:flex;align-items:center;gap:22px;padding:0 24px;background:#0a1a3a;border-bottom:1px solid rgba(120,160,255,.14);font-size:21px;color:#9fb2d8'
      bar
        .querySelectorAll('i')
        .forEach((dot) => (dot.style.cssText += ';display:block;width:14px;height:14px;border-radius:50%'))
      bar.querySelector('.file').style.cssText =
        'font-family:Consolas,"Cascadia Mono",monospace;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'
      bar.querySelector('.badge').style.cssText =
        'display:flex;align-items:center;gap:12px;padding:7px 8px 7px 16px;border-radius:999px;background:rgba(77,163,255,.14);color:#cfe3ff;font-weight:600;font-size:20px;white-space:nowrap'
      bar.querySelector('.badge b').style.cssText =
        'font-family:Consolas,"Cascadia Mono",monospace;font-weight:600;color:#7cc0ff;background:rgba(0,0,0,.28);padding:5px 12px;border-radius:999px'
      const body = el('div')
      body.style.cssText = 'padding:20px 0'
      const lineNodes = rows.map((row) => {
        const line = el('div')
        line.style.cssText = `display:flex;height:${lineHeight}px;line-height:${lineHeight}px;font-family:Consolas,"Cascadia Mono",monospace;font-size:${fontSize}px;border-left:4px solid transparent;white-space:pre`
        if (row.gap) {
          line.innerHTML = `<span style="width:92px;text-align:right;padding-right:22px;color:#51628a">&#8942;</span><span style="color:#51628a">&nbsp;</span>`
        } else {
          line.innerHTML = `<span style="width:92px;text-align:right;padding-right:22px;color:#51628a;flex:none">${row.number}</span><span class="code">${row.html || ' '}</span>`
        }
        body.append(line)
        return line
      })
      box.append(bar, body)
      root.append(box)
      return { panel, rows, box, lineNodes, zoom }
    })

    root.insertAdjacentHTML(
      'beforeend',
      `<style>
        #${id} .code{color:#dbe6ff}
        #${id} .hljs-comment{color:#7d8fb8;font-style:italic}
        #${id} .hljs-keyword,#${id} .hljs-built_in,#${id} .hljs-literal{color:#7cc0ff}
        #${id} .hljs-string,#${id} .hljs-template-string{color:#9be0ad}
        #${id} .hljs-number{color:#ffb86b}
        #${id} .hljs-title.function_,#${id} .hljs-title{color:#ffd479}
        #${id} .hljs-attr,#${id} .hljs-property{color:#c9d6ff}
        #${id} .hljs-params,#${id} .hljs-variable{color:#dbe6ff}
        #${id} .hljs-regexp{color:#ff9c8a}
        #${id} .hljs-subst{color:#dbe6ff}
      </style>`,
    )

    const extra = extras ? await extras(root, { scene }) : null

    return {
      update(t) {
        list.forEach(({ panel, rows, box, lineNodes, zoom }) => {
          const into = ease.out(prog(t, panel.from, panel.from + 0.4))
          const out = 1 - ease.in(prog(t, panel.to - 0.28, panel.to))
          const visible = t >= panel.from && t < panel.to
          box.style.display = visible ? 'block' : 'none'
          if (!visible) return
          box.style.opacity = String(clamp(into) * out)
          box.style.transform = `translateY(${(1 - into) * 36}px) scale(${zoom * (0.985 + 0.015 * into)})`

          const active = (panel.highlights ?? []).filter((h) => t >= h.at && t < h.until)
          lineNodes.forEach((node, index) => {
            const row = rows[index]
            /* lines type in, top to bottom */
            const shown = t >= panel.from + 0.2 + index * 0.05
            const lit = !row.gap && active.some((h) => row.number >= h.lines[0] && row.number <= h.lines[1])
            node.style.opacity = shown ? String(active.length && !lit ? 0.5 : 1) : '0'
            node.style.background = lit
              ? 'linear-gradient(90deg, rgba(77,163,255,.28), rgba(77,163,255,.08))'
              : 'transparent'
            node.style.borderLeftColor = lit ? '#4da3ff' : 'transparent'
          })
        })
        extra?.update(t)
      },
    }
  }
}
