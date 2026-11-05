/* The left side of the checkout: what is being bought, from whom, and the total in the currency the buyer pays in. */
import { ArrowLeft, LinkSimple, LockSimple } from '@phosphor-icons/react'
import { courseFacts, usd } from '@/lib/format.js'
import { formatMinor } from '#shared/money.js'
import { hashFor } from '@/stores/nav.js'
import Logo from '@/ui/Logo.jsx'
import CourseCover from '../CourseCover.jsx'
import s from './Checkout.module.css'

/* price: { currency, minorUnits, amount }. viaPaypal: card and PayPal charge in US dollars, whatever the country. */
export default function OrderSummary({ product, place, price, viaPaypal, link = null }) {
  const total = price ? formatMinor(price.amount, price) : null

  return (
    <aside className={s.summary} aria-label="Order summary">
      <div className={s.summaryInner}>
        <a className={s.back} href={hashFor('buyer', 'course', product.slug)}>
          <ArrowLeft size={16} aria-hidden />
          Back to Prone Data Learning
        </a>

        {link && (
          <div className={s.linkBanner}>
            <LinkSimple size={18} aria-hidden />
            <div>
              <p className={s.linkName}>{link.title}</p>
              {link.note && <p className={s.linkNote}>{link.note}</p>}
            </div>
          </div>
        )}

        <div className={s.item}>
          <CourseCover product={product} size="small" />
          <div className={s.itemText}>
            <p className={s.seller}>Prone Data Learning</p>
            <h1 className={s.product}>{product.title}</h1>
            <p className={s.facts}>{courseFacts(product)}</p>
          </div>
        </div>

        <div className={s.total}>
          <p className={s.totalLabel}>Total due</p>
          <p className={s.totalValue} aria-live="polite">
            {total ?? usd(product.priceUsdCents)}
          </p>
          {place && viaPaypal && (
            <p className={s.totalNote}>Charged in US dollars. PayPal does not take {place.currencyName}.</p>
          )}
          {place && !viaPaypal && (
            <p className={s.totalNote}>
              {usd(product.priceUsdCents)} USD. {place.currency === 'USD' ? '' : 'Indicative rate, simulated.'}
            </p>
          )}
        </div>

        <dl className={s.lines}>
          <div>
            <dt>Course</dt>
            <dd>{usd(product.priceUsdCents)}</dd>
          </div>
          <div>
            <dt>Access</dt>
            <dd>Yours forever</dd>
          </div>
        </dl>

        <p className={s.powered}>
          <LockSimple size={14} aria-hidden />
          Powered by
          <Logo height={16} />
        </p>
      </div>
    </aside>
  )
}
