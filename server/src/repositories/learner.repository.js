/* The courses a buyer has unlocked. */
import { camelize } from '#server/lib/case.js'

export function createLearnerRepository({ db }) {
  return {
    async coursesOf(buyerId) {
      const rows = await db.query(
        `select pr.id, pr.slug, pr.title, pr.subtitle, pr.category, pr.level, pr.lessons, pr.hours::float8 as hours,
                pr.cover, e.granted_at
           from public.enrollments e
           join public.products pr on pr.id = e.product_id
          where e.buyer_id = $1
          order by e.granted_at desc`,
        [buyerId],
      )
      return camelize(rows)
    },
  }
}
