/* The page behind a payment link: #/buyer/link/<code>. It finds what the link points to and opens the checkout for that
   course, carrying the link so the seller can see the sale came through it. A link that is paused, expired, full or
   unknown says so instead. */
import { useEffect, useState } from 'react'
import { LinkBreak } from '@phosphor-icons/react'
import { resolveLink } from '@/api/seller.js'
import { useNav } from '@/stores/nav.js'
import { Button } from '@/ui/Button.jsx'
import { EmptyState, Skeleton } from '@/ui/States.jsx'
import Checkout from './checkout/Checkout.jsx'
import s from './checkout/Checkout.module.css'

export default function LinkPage({ param: code }) {
  const go = useNav((state) => state.go)
  const [state, setState] = useState({ code: null, status: 'loading', link: null, message: null })

  useEffect(() => {
    let current = true
    resolveLink(code).then(
      ({ link }) =>
        current && setState({ code, status: link.available ? 'ready' : 'unavailable', link, message: link.reason }),
      (error) =>
        current &&
        setState({
          code,
          status: 'unavailable',
          link: null,
          message: error.status === 404 || error.status === 400 ? 'We could not find that link.' : error.message,
        }),
    )
    return () => {
      current = false
    }
  }, [code])

  /* A new code starts from the beginning. */
  const waiting = state.code !== code || state.status === 'loading'

  if (waiting) {
    return (
      <div className={s.page}>
        <div className={s.summary}>
          <div className={s.summaryInner}>
            <Skeleton height={20} width="50%" />
            <Skeleton height={72} />
          </div>
        </div>
        <div className={s.main}>
          <div className={s.mainInner}>
            <Skeleton height={380} radius={16} />
          </div>
        </div>
      </div>
    )
  }

  if (state.status === 'unavailable') {
    return (
      <div className={s.center}>
        <EmptyState
          icon={LinkBreak}
          title="This link cannot be used"
          action={<Button onClick={() => go('buyer', 'home')}>See all courses</Button>}
        >
          {state.message}
        </EmptyState>
      </div>
    )
  }

  return <Checkout param={state.link.product.slug} link={state.link} />
}
