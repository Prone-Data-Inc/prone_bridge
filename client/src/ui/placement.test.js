// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pageZoom } from '@/lib/zoom.js'
import { GAP, MARGIN, place } from './placement.js'

const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height })
const element = (rect) => ({ getBoundingClientRect: () => rect })

/* What the browser reports at a zoom: every position and size is that many times bigger. */
const measured = (zoom, rect) => box(rect.left * zoom, rect.top * zoom, rect.width * zoom, rect.height * zoom)

const setWindow = (width, height) => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
}

beforeEach(() => setWindow(1600, 900))
afterEach(() => document.documentElement.style.removeProperty('--zoom'))

describe('place', () => {
  const anchor = box(800, 100, 40, 40)
  const panel = box(0, 0, 300, 200)

  it('puts the panel under its anchor, right edges together', () => {
    expect(place(element(anchor), element(panel), 'right', 1)).toEqual({
      top: 140 + GAP,
      left: 840 - 300,
      origin: 'top',
    })
  })

  it('can line the left edges up instead', () => {
    expect(place(element(anchor), element(panel), 'left', 1).left).toBe(800)
  })

  it('goes above the anchor when there is no room below', () => {
    const low = box(800, 780, 40, 40)
    expect(place(element(low), element(panel), 'right', 1)).toMatchObject({ top: 780 - GAP - 200, origin: 'bottom' })
  })

  it('stays inside the window on both sides', () => {
    expect(place(element(box(4, 100, 40, 40)), element(panel), 'right', 1).left).toBe(MARGIN)
    expect(place(element(box(1590, 100, 40, 40)), element(panel), 'left', 1).left).toBe(1600 - 300 - MARGIN)
  })

  it("lands in the same place on a zoomed screen, in the page's own pixels", () => {
    const plain = place(element(anchor), element(panel), 'right', 1)
    for (const zoom of [1.2, 1.33, 1.5, 2, 3]) {
      setWindow(1600 * zoom, 900 * zoom)
      const zoomed = place(element(measured(zoom, anchor)), element(measured(zoom, panel)), 'right', zoom)
      expect(zoomed.top).toBeCloseTo(plain.top, 5)
      expect(zoomed.left).toBeCloseTo(plain.left, 5)
      expect(zoomed.origin).toBe(plain.origin)
    }
  })

  it('flips above on a zoomed screen at the same place it would on a plain one', () => {
    const low = box(800, 780, 40, 40)
    setWindow(1600 * 1.5, 900 * 1.5)
    expect(place(element(measured(1.5, low)), element(measured(1.5, panel)), 'right', 1.5)).toMatchObject({
      origin: 'bottom',
      top: 780 - GAP - 200,
    })
  })

  it('reads the zoom of the page when none is given', () => {
    document.documentElement.style.setProperty('--zoom', '1.5')
    setWindow(1600 * 1.5, 900 * 1.5)
    const result = place(element(measured(1.5, anchor)), element(measured(1.5, panel)), 'right')
    expect(result.left).toBeCloseTo(540, 5)
  })
})

describe('pageZoom', () => {
  it('is 1 on a laptop and a phone', () => {
    expect(pageZoom()).toBe(1)
  })

  it('is the zoom the page was given', () => {
    document.documentElement.style.setProperty('--zoom', '1.33')
    expect(pageZoom()).toBe(1.33)
  })

  it('is 1 when the value makes no sense', () => {
    for (const bad of ['', 'big', '0', '-2']) {
      document.documentElement.style.setProperty('--zoom', bad)
      expect(pageZoom()).toBe(1)
    }
  })
})
