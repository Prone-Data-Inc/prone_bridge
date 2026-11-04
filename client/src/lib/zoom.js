/* On very large screens the whole interface is scaled with CSS zoom (see styles/base.css). Styles are then written in the
   zoomed pixels, but the browser measures in screen pixels: getBoundingClientRect and the window size are zoom times
   bigger than the numbers a style should be given. Code that places something from a measurement divides by this. */
export function pageZoom() {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zoom'))
  return Number.isFinite(value) && value > 0 ? value : 1
}
