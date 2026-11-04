import { z } from 'zod'
import { ok } from '#server/lib/response.js'
import { parseBody, parseQuery } from '#server/lib/validate.js'

const audience = z.enum(['buyer', 'seller', 'admin'])
const slug = z.string().regex(/^[a-z0-9-]{1,40}$/, 'Use a seller name like pdl.')
const id = z.uuid('That is not a valid id.')

const listQuery = z.object({
  audience,
  merchant: slug.optional(),
  buyer: id.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

const summaryQuery = z.object({ merchant: slug.optional(), buyer: id.optional() })

const readBody = z.object({
  audience,
  merchant: slug.optional(),
  buyer: id.optional(),
  ids: z.array(id).min(1).max(100).optional(),
})

export const createNotificationController = ({ notificationService }) => ({
  list: async (c) => ok(c, await notificationService.list(parseQuery(c, listQuery))),
  summary: async (c) => ok(c, await notificationService.summary(parseQuery(c, summaryQuery))),
  markRead: async (c) => ok(c, await notificationService.markRead(await parseBody(c, readBody))),
})
