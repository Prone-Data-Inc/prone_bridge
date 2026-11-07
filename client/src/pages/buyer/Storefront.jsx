/* Prone Data Learning's storefront: a short pitch and the courses. Pressing Buy opens the ProneBridge checkout. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { WarningCircle } from '@phosphor-icons/react'
import { cx } from '@/lib/cx.js'
import { useCatalog } from '@/stores/catalog.js'
import { useLearner } from '@/stores/learner.js'
import { useNav } from '@/stores/nav.js'
import { useSession } from '@/stores/session.js'
import { toast } from '@/stores/toasts.js'
import { Button } from '@/ui/Button.jsx'
import Segmented from '@/ui/Segmented.jsx'
import { EmptyState, Skeleton } from '@/ui/States.jsx'
import CourseCard from './CourseCard.jsx'
import PdlFrame from './PdlFrame.jsx'
import { rotateBrowserSuffix } from './checkout/personas.js'
import p from './Pdl.module.css'
import s from './Storefront.module.css'

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'data', label: 'Data' },
  { value: 'ai', label: 'AI' },
  { value: 'automation', label: 'Automation' },
]

export default function Storefront() {
  const { status, products, error, ensure, reload } = useCatalog()
  const courses = useLearner((state) => state.courses)
  const learnerLoaded = useLearner((state) => state.loaded)
  const go = useNav((state) => state.go)
  const [filter, setFilter] = useState('all')
  const restarted = useRef(false)

  useEffect(() => {
    ensure()
  }, [ensure])

  const owned = useMemo(() => new Set(courses.map((course) => course.id)), [courses])

  /* Courses still to buy come first. Inside each group the order is the catalog's. */
  const shown = useMemo(
    () =>
      products
        .filter((product) => filter === 'all' || product.category === filter)
        .sort((a, b) => Number(owned.has(a.id)) - Number(owned.has(b.id))),
    [products, filter, owned],
  )

  /* There is always something to buy. A buyer who owns every course carries on as a new demo buyer, and is told. */
  useEffect(() => {
    if (restarted.current || status !== 'ready' || !learnerLoaded || products.length === 0) return
    if (!products.every((product) => owned.has(product.id))) return
    restarted.current = true
    rotateBrowserSuffix()
    useSession.getState().forgetBuyer()
    toast('You own every course, so you are now a new demo buyer. There is always something to buy.', {
      title: 'Demo',
      tone: 'success',
      duration: 9000,
    })
  }, [status, learnerLoaded, products, owned])

  return (
    <PdlFrame>
      <section className={cx(p.container, s.hero)}>
        <p className={s.eyebrow}>Prone Data Learning</p>
        <h1 className={s.title}>Learn what moves work forward.</h1>
        <p className={s.lead}>Short video courses in data, AI and automation. Pay once. Keep them forever.</p>
        <div className={s.actions}>
          <Button
            variant="primary"
            size="lg"
            onClick={() => document.getElementById('courses')?.scrollIntoView({ behavior: 'smooth' })}
          >
            Browse courses
          </Button>
          <span className={s.note}>Pay in your own currency.</span>
        </div>
      </section>

      <section id="courses" className={cx(p.container, s.section)} aria-labelledby="courses-title">
        <header className={s.head}>
          <h2 id="courses-title" className={s.heading}>
            Courses
          </h2>
          <Segmented variant="text" label="Subject" value={filter} onChange={setFilter} options={FILTERS} />
        </header>

        {status === 'error' && (
          <EmptyState
            icon={WarningCircle}
            title="We could not load the courses"
            action={<Button onClick={reload}>Try again</Button>}
          >
            {error}
          </EmptyState>
        )}

        {status !== 'error' && (
          <ul className={s.grid} aria-busy={status !== 'ready'}>
            {status !== 'ready' &&
              [0, 1, 2, 3, 4, 5].map((key) => (
                <li key={key}>
                  <Skeleton height={340} radius={16} />
                </li>
              ))}
            {status === 'ready' &&
              shown.map((product) => (
                <li key={product.id}>
                  <CourseCard
                    product={product}
                    owned={owned.has(product.id)}
                    onBuy={() => go('buyer', 'checkout', product.slug)}
                    onOpen={() => go('buyer', 'course', product.slug)}
                  />
                </li>
              ))}
          </ul>
        )}
      </section>
    </PdlFrame>
  )
}
