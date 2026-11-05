/* A payment link, as a buyer meets it: the page behind #/buyer/link/<code> asks what it points to and whether it can still
   be used. The price is never part of a link. It is read from the course, so a link cannot carry a discount. */
import { LINK_REASONS, linkState } from '#server/lib/links.js'
import { notFound } from '#server/lib/errors.js'
import { createLinkRepository } from '#server/repositories/link.repository.js'

export function createLinkService({ db, now = () => new Date() }) {
  const links = createLinkRepository({ db })

  return {
    async resolve(code) {
      const link = await links.findByCode(code)
      if (!link) throw notFound('We could not find that link.')
      const state = linkState(link, now())
      return {
        code: link.code,
        title: link.title,
        note: link.note,
        state,
        available: state === 'active',
        reason: state === 'active' ? null : LINK_REASONS[state],
        product: { slug: link.productSlug, title: link.productTitle },
        merchant: { slug: link.merchantSlug, name: link.merchantName },
      }
    },
  }
}
