import { describe, expect, it } from 'vitest'
import { buildSeed } from '../../../../server/src/db/seed/build.js'
import { curriculumFor } from './curriculum.js'

describe('curriculumFor', () => {
  it('adds up to the lessons of the course, for every course in the demo', () => {
    const { products, merchants } = buildSeed({ now: new Date('2026-11-04T12:00:00Z') })
    const pdl = merchants.find((merchant) => merchant.slug === 'pdl')
    const courses = products.filter((product) => product.merchant_id === pdl.id)
    expect(courses).toHaveLength(8)
    for (const course of courses) {
      const modules = curriculumFor({ slug: course.slug, lessons: course.lessons })
      expect(
        modules.reduce((sum, module) => sum + module.lessons, 0),
        course.slug,
      ).toBe(course.lessons)
      expect(modules.length, course.slug).toBeGreaterThanOrEqual(4)
      expect(modules.every((module) => module.lessons >= 1)).toBe(true)
      expect(new Set(modules.map((module) => module.id)).size).toBe(modules.length)
    }
  })

  it('spreads the remainder over the first modules', () => {
    expect(curriculumFor({ slug: 'prompt-craft', lessons: 14 }).map((module) => module.lessons)).toEqual([4, 4, 3, 3])
  })

  it('gives an unknown course a sensible outline', () => {
    const modules = curriculumFor({ slug: 'something-new', lessons: 10 })
    expect(modules.map((module) => module.title)).toEqual([
      'Getting started',
      'Core skills',
      'In practice',
      'Next steps',
    ])
    expect(modules.reduce((sum, module) => sum + module.lessons, 0)).toBe(10)
  })

  it('writes short titles with no dashes', () => {
    const { products } = buildSeed({ now: new Date('2026-11-04T12:00:00Z') })
    for (const product of products) {
      for (const module of curriculumFor({ slug: product.slug, lessons: product.lessons })) {
        expect(module.title.length).toBeLessThan(32)
        expect(module.title).not.toMatch(/[-]/)
      }
    }
  })
})
