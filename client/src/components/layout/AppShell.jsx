/* The frame of the whole app: tab strip, toolbar, then the sidebar and the pages. Every tab you have opened keeps its page
   mounted, hidden, like a browser tab, so a checkout in progress survives a look at the seller's dashboard. */
import { lazy, Suspense } from 'react'
import { TABS } from '@/config/tabs.js'
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
  const visited = useNav((state) => state.visited)

  return (
    <div className={s.shell}>
      <TabStrip />
      <Toolbar />
      <div className={s.body}>
        <Sidebar />
        <main className={s.page}>
          {view === 'ui' && (
            <div className={`${s.pane} ${s.scrolls}`}>
              <Suspense fallback={<Skeleton height={400} radius={16} />}>
                <Gallery />
              </Suspense>
            </div>
          )}
          {TABS.map(
            ({ id }) =>
              visited[id] && (
                <div
                  key={id}
                  id={`workspace-${id}`}
                  className={s.pane}
                  role="tabpanel"
                  aria-labelledby={`tab-${id}`}
                  hidden={view === 'ui' || id !== tab}
                >
                  <PageView tab={id} />
                </div>
              ),
          )}
        </main>
      </div>
      <Toasts />
    </div>
  )
}
