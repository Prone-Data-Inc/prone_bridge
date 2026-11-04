import { request } from './client.js'

export const getHealth = (options) => request('/health', options)
