/* Where a floating layer goes: under its anchor, aligned to the anchor's right or left edge, flipped above when there is no
   room below, and kept inside the window. Everything is measured in screen pixels and handed back in the page's own
   (zoomed) pixels, since that is what a style takes. */
import { pageZoom } from '@/lib/zoom.js'

export const GAP = 6
export const MARGIN = 8

export function place(anchor, panel, align, zoom = pageZoom()) {
  const box = anchor.getBoundingClientRect()
  const size = panel.getBoundingClientRect()
  const rect = { top: box.top / zoom, bottom: box.bottom / zoom, left: box.left / zoom, right: box.right / zoom }
  const width = size.width / zoom
  const height = size.height / zoom
  const viewport = { width: window.innerWidth / zoom, height: window.innerHeight / zoom }

  const below = rect.bottom + GAP + height <= viewport.height - MARGIN || rect.top - GAP - height < MARGIN
  const left = align === 'left' ? rect.left : rect.right - width
  return {
    top: below ? rect.bottom + GAP : rect.top - GAP - height,
    left: Math.min(Math.max(MARGIN, left), viewport.width - width - MARGIN),
    origin: below ? 'top' : 'bottom',
  }
}
