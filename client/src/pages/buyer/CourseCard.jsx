/* A course on the storefront: its picture, name, facts and price, and a button to buy it or open it. */
import { courseFacts, usd } from '@/lib/format.js'
import { hashFor } from '@/stores/nav.js'
import { Button } from '@/ui/Button.jsx'
import CourseCover from './CourseCover.jsx'
import s from './CourseCard.module.css'

export default function CourseCard({ product, owned, onBuy, onOpen }) {
  return (
    <article className={s.card}>
      <a className={s.cover} href={hashFor('buyer', 'course', product.slug)} tabIndex={-1} aria-hidden>
        <CourseCover product={product} />
      </a>
      <div className={s.body}>
        <p className={s.tag}>{product.category === 'ai' ? 'AI' : product.category}</p>
        <h3 className={s.title}>
          <a href={hashFor('buyer', 'course', product.slug)}>{product.title}</a>
        </h3>
        <p className={s.subtitle}>{product.subtitle}</p>
        <p className={s.facts}>{courseFacts(product)}</p>
      </div>
      <footer className={s.footer}>
        <span className={s.price}>{usd(product.priceUsdCents)}</span>
        {owned ? (
          <Button onClick={() => onOpen(product)}>Open course</Button>
        ) : (
          <Button variant="primary" onClick={() => onBuy(product)}>
            Buy
          </Button>
        )}
      </footer>
    </article>
  )
}
