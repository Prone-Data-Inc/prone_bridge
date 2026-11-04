/* The frame of the whole app: tab strip, toolbar, then the sidebar and the page of the open tab. */
import { lazy, Suspense, useEffect, useRef } from 'react'
import PageView from '@/pages/PageView.jsx'
import { useNav } from '@/stores/nav.js'
import Toasts from '@/ui/Toasts.jsx'
import { Skeleton } from '@/ui/States.jsx'
import Sidebar from './Sidebar.jsx'
import TabStrip from './TabStrip.jsx'
import Toolbar from './Toolbar.jsx'
import s from './AppShell.module.css'

const Gallery = lazy(() => import('@/pages/ui/Gallery.jsx'))

export default function AppShell() {
  const view = useNav((state) => state.view)
  const tab = useNav((state) => state.tab)
  const section = useNav((state) => state.section)
  const page = useRef(null)

  /* A new page starts at the top. */
  useEffect(() => {
    page.current?.scrollTo({ top: 0 })
  }, [view, tab, section])

  return (
    <div className={s.shell}>
      <TabStrip />
      <Toolbar />
      <div className={s.body}>
        <Sidebar />
        <main
          ref={page}
          id="workspace"
          className={s.page}
          role="tabpanel"
          aria-labelledby={tab ? `tab-${tab}` : undefined}
        >
          {view === 'ui' ? (
            <Suspense fallback={<Skeleton height={400} radius={16} />}>
              <Gallery />
            </Suspense>
          ) : (
            <PageView />
          )}
        </main>
      </div>
      <Toasts />
    </div>
  )
}
