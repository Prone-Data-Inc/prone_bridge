import { ok } from '#server/lib/response.js'

export const createHealthController = ({ healthService }) => ({
  get: (c) => ok(c, healthService.check()),
})
