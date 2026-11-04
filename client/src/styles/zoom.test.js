/* The large screen steps live in CSS, which a unit test cannot run. This reads the stylesheet and checks the rules that
   are easy to break by hand: each step sets --zoom to the same number as zoom, and the steps only ever go up. */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./base.css', import.meta.url), 'utf8')
const tokens = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

const steps = [
  ...css.matchAll(/@media \(min-width: (\d+)px\) and \(min-height: (\d+)px\) \{\s*:root \{([^}]*)\}\s*\}/g),
].map(([, width, height, body]) => ({
  width: Number(width),
  height: Number(height),
  zoom: Number(body.match(/(?<![-\w])zoom:\s*([\d.]+);/)?.[1]),
  custom: Number(body.match(/--zoom:\s*([\d.]+);/)?.[1]),
  pageMax: Number(body.match(/--page-max:\s*(\d+)px/)?.[1] ?? NaN),
  siteMax: Number(body.match(/--site-max:\s*(\d+)px/)?.[1] ?? NaN),
}))

describe('large screen steps', () => {
  it('has a step for every size from a 32 inch monitor up to a 64 inch screen', () => {
    expect(steps.length).toBeGreaterThanOrEqual(6)
    expect(steps[0]).toMatchObject({ width: 2300 })
    expect(steps.at(-1).width).toBeGreaterThanOrEqual(5600)
  })

  it('tells code that measures the screen the same zoom the styles use', () => {
    for (const step of steps) {
      expect(step.zoom).toBeGreaterThan(1)
      expect(step.custom).toBe(step.zoom)
    }
  })

  it('only goes up: a bigger screen is never scaled less', () => {
    for (let index = 1; index < steps.length; index += 1) {
      expect(steps[index].width).toBeGreaterThan(steps[index - 1].width)
      expect(steps[index].height).toBeGreaterThan(steps[index - 1].height)
      expect(steps[index].zoom).toBeGreaterThan(steps[index - 1].zoom)
    }
  })

  it('keeps the interface about the size of a 1920 pixel screen, however large the screen is', () => {
    for (const step of steps) {
      const effective = step.width / step.zoom
      expect(effective).toBeGreaterThan(1500)
      expect(effective).toBeLessThan(2700)
    }
  })

  it('lets the content spread a little wider, never narrower, as the screen grows', () => {
    const sized = steps.filter((step) => Number.isFinite(step.pageMax))
    expect(sized.length).toBeGreaterThanOrEqual(4)
    for (let index = 1; index < sized.length; index += 1) {
      expect(sized[index].pageMax).toBeGreaterThanOrEqual(sized[index - 1].pageMax)
      expect(sized[index].siteMax).toBeGreaterThanOrEqual(sized[index - 1].siteMax)
    }
    expect(sized[0].pageMax).toBeGreaterThan(1240)
    expect(sized[0].siteMax).toBeGreaterThan(1160)
  })

  it('leaves laptops and phones alone', () => {
    expect(tokens).toMatch(/--zoom:\s*1;/)
    expect(steps.every((step) => step.width >= 2300 && step.height >= 1100)).toBe(true)
  })
})

describe('sizes taken from the window', () => {
  const files = [
    '../ui/Modal.module.css',
    '../ui/Toasts.module.css',
    '../components/notifications/NotificationBell.module.css',
    '../pages/buyer/Storefront.module.css',
    '../pages/buyer/CourseDetail.module.css',
    '../pages/buyer/MyCourses.module.css',
  ]

  it('divide by the zoom, so a zoomed screen does not overflow', () => {
    for (const file of files) {
      const text = readFileSync(new URL(file, import.meta.url), 'utf8')
      const uses = text.match(/\d*\.?\d+v[hw]\b/g) ?? []
      const divided = text.match(/\d*\.?\d+v[hw] \/ var\(--zoom\)/g) ?? []
      expect(uses.length, file).toBeGreaterThan(0)
      expect(divided.length, file).toBe(uses.length)
    }
  })
})
