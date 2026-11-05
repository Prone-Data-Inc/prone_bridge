/* The page a tab is on. Each tab has its own, so a tab you have left keeps showing what you were doing. */
import { Suspense, useEffect, useRef } from 'react'
import ErrorBoundary from '@/components/ErrorBoundary.jsx'
import { useNav } from '@/stores/nav.js'
import { Skeleton } from '@/ui/States.jsx'
import { PAGES } from './index.js'
import Placeholder from './Placeholder.jsx'
import s from './Page.module.css'

export default function PageView({ tab }) {
  const section = useNav((state) => state.sections[tab])
  const param = useNav((state) => state.params[tab])
  const Page = PAGES[`${tab}/${section}`]
  const scroller = useRef(null)

  /* A new page starts at the top. */
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [section, param])

  return (
    <div ref={scroller} className={s.scroller}>
      <ErrorBoundary resetKey={`${tab}/${section}/${param}`}>
        <Suspense
          fallback={
            <div className={s.page}>
              <Skeleton height={32} width={220} />
              <Skeleton height={320} radius={16} />
            </div>
          }
        >
          {Page ? <Page param={param} /> : <Placeholder tab={tab} section={section} />}
        </Suspense>
      </ErrorBoundary>
    </div>
  )
}
