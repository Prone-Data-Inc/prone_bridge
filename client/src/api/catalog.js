import { request } from './client.js'

/* The courses of a seller, and the countries where it takes payments. */
export const listProducts = (merchant = 'pdl', options) => request(`/catalog/products?merchant=${merchant}`, options)
export const listCountries = (merchant = 'pdl', options) => request(`/catalog/countries?merchant=${merchant}`, options)
