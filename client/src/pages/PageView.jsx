/* Shows the page of the open tab and section. */
import { Suspense } from 'react'
import { useNav } from '@/stores/nav.js'
import { Skeleton } from '@/ui/States.jsx'
import { PAGES } from './index.js'
import Placeholder from './Placeholder.jsx'
import s from './Page.module.css'

export default function PageView() {
  const tab = useNav((state) => state.tab)
  const section = useNav((state) => state.section)
  const Page = PAGES[`${tab}/${section}`]

  return (
    <Suspense
      fallback={
        <div className={s.page}>
          <Skeleton height={32} width={220} />
          <Skeleton height={320} radius={16} />
        </div>
      }
    >
      {Page ? <Page /> : <Placeholder tab={tab} section={section} />}
    </Suspense>
  )
}
