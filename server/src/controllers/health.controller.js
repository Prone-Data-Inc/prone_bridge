import { ok } from '#server/lib/response.js'

export const createHealthController = ({ healthService }) => ({
  get: async (c) => ok(c, await healthService.check()),
})
