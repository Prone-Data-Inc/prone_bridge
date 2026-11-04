/* The storefront's data: the courses and the countries with their payment methods. Loaded once and kept, so moving between
   the storefront, a course and the checkout is instant. status: 'idle', 'loading', 'ready' or 'error'. */
import { create } from 'zustand'
import { listCountries, listProducts } from '@/api/catalog.js'

export const useCatalog = create((set, get) => ({
  status: 'idle',
  error: null,
  merchant: null,
  products: [],
  countries: [],

  async ensure() {
    if (['loading', 'ready'].includes(get().status)) return
    await get().reload()
  },

  async reload() {
    set({ status: 'loading', error: null })
    try {
      const [courses, places] = await Promise.all([listProducts(), listCountries()])
      set({ status: 'ready', merchant: courses.merchant, products: courses.products, countries: places.countries })
    } catch (error) {
      set({ status: 'error', error: error.message })
    }
  },
}))

export const productBySlug = (products, slug) => products.find((product) => product.slug === slug) ?? null
