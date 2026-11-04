/* Notifications for the three tabs. The seller is named by its slug, the buyer by an id the browser remembers, the
   admin by nothing. In this demo there is no sign-in: the three roles are simulated, so scoping is by these ids. */
import { notFound, unavailable } from '#server/lib/errors.js'

export function createNotificationService({ repository, catalogRepository }) {
  const ready = () => {
    if (!repository) throw unavailable('The database is not connected yet.')
  }

  async function merchantId(slug) {
    if (!slug) return null
    const merchant = await catalogRepository.findMerchant(slug)
    if (!merchant) throw notFound('We could not find that seller.')
    return merchant.id
  }

  /* The id an audience is scoped by, or null when the audience has nothing yet (a buyer who has not paid). */
  async function scopeOf(audience, { merchant, buyer }) {
    if (audience === 'seller') return merchantId(merchant ?? 'pdl')
    if (audience === 'buyer') return buyer ?? null
    return null
  }

  return {
    async list({ audience, merchant, buyer, limit }) {
      ready()
      const scopeId = await scopeOf(audience, { merchant, buyer })
      if (audience === 'buyer' && !scopeId) return { items: [] }
      return { items: await repository.list({ audience, scopeId, limit }) }
    },

    async summary({ merchant, buyer }) {
      ready()
      return repository.unreadCounts({ merchantId: await merchantId(merchant ?? 'pdl'), buyerId: buyer ?? null })
    },

    async markRead({ audience, merchant, buyer, ids }) {
      ready()
      const scopeId = await scopeOf(audience, { merchant, buyer })
      if (audience === 'buyer' && !scopeId) return { marked: 0 }
      return { marked: await repository.markRead({ audience, scopeId, ids: ids ?? null }) }
    },
  }
}
