// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { countries, courses } from '../../test/buyerData.js'

vi.mock('@/api/catalog.js', () => ({ listProducts: vi.fn(), listCountries: vi.fn() }))

const { listCountries, listProducts } = await import('@/api/catalog.js')
const { productBySlug, useCatalog } = await import('./catalog.js')

const merchant = { slug: 'pdl', name: 'Prone Data Learning' }

beforeEach(() => {
  useCatalog.setState({ status: 'idle', error: null, merchant: null, products: [], countries: [] })
  listProducts.mockResolvedValue({ merchant, products: courses })
  listCountries.mockResolvedValue({ merchant, countries })
})

describe('catalog store', () => {
  it('loads the courses and the countries together', async () => {
    const pending = useCatalog.getState().ensure()
    expect(useCatalog.getState().status).toBe('loading')
    await pending
    expect(useCatalog.getState()).toMatchObject({ status: 'ready', merchant, products: courses, countries })
  })

  it('loads once, however many pages ask', async () => {
    await Promise.all([useCatalog.getState().ensure(), useCatalog.getState().ensure()])
    await useCatalog.getState().ensure()
    expect(listProducts).toHaveBeenCalledTimes(1)
    expect(listCountries).toHaveBeenCalledTimes(1)
  })

  it('says what went wrong, and can be tried again', async () => {
    listProducts.mockRejectedValueOnce(new Error('We could not reach the server.'))
    await useCatalog.getState().ensure()
    expect(useCatalog.getState()).toMatchObject({ status: 'error', error: 'We could not reach the server.' })

    await useCatalog.getState().ensure()
    expect(useCatalog.getState().status).toBe('ready')
    expect(useCatalog.getState().error).toBeNull()
  })

  it('reloads on request', async () => {
    await useCatalog.getState().ensure()
    await useCatalog.getState().reload()
    expect(listProducts).toHaveBeenCalledTimes(2)
  })
})

describe('productBySlug', () => {
  it('finds a course by its name in the address, or nothing', () => {
    expect(productBySlug(courses, 'sql-in-practice').title).toBe('SQL in Practice')
    expect(productBySlug(courses, 'nope')).toBeNull()
    expect(productBySlug([], 'ai-for-work')).toBeNull()
  })
})
