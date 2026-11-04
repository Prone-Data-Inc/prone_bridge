/* The bar under the tab strip: where you are on the left, theme, notifications and who you are on the right.
   Below 1024px it also holds the button that opens the sidebar. */
import { ArrowLeft, CaretRight, List } from '@phosphor-icons/react'
import { sectionOf, tabById } from '@/config/tabs.js'
import { useNav } from '@/stores/nav.js'
import { useSession } from '@/stores/session.js'
import Avatar from '@/ui/Avatar.jsx'
import { Button, IconButton } from '@/ui/Button.jsx'
import NotificationBell from '@/components/notifications/NotificationBell.jsx'
import ThemeToggle from './ThemeToggle.jsx'
import s from './Toolbar.module.css'

export default function Toolbar() {
  const { view, tab, section, go } = useNav()
  const toggleDrawer = useNav((state) => state.toggleDrawer)
  const buyer = useSession((state) => state.buyer)
  const def = tabById(tab)

  if (view === 'ui') {
    return (
      <div className={s.toolbar}>
        <div className={s.left}>
          <Button variant="ghost" icon={ArrowLeft} onClick={() => go('buyer')}>
            Back to app
          </Button>
          <span className={s.muted}>/</span>
          <span className={s.current}>Design system</span>
        </div>
        <div className={s.right}>
          <ThemeToggle />
        </div>
      </div>
    )
  }

  const identity = tab === 'buyer' && buyer ? { name: buyer.name, role: 'Buyer' } : def.identity

  return (
    <div className={s.toolbar}>
      <div className={s.left}>
        {def.sidebar && <IconButton icon={List} label="Menu" className={s.menu} onClick={() => toggleDrawer()} />}
        <nav className={s.crumbs} aria-label="Breadcrumb">
          <span className={s.muted}>{def.label}</span>
          <CaretRight size={12} className={s.muted} aria-hidden />
          <span className={s.current}>{sectionOf(tab, section)?.label}</span>
        </nav>
      </div>
      <div className={s.right}>
        <ThemeToggle />
        <NotificationBell />
        <div className={s.identity}>
          <Avatar name={identity.name} size={28} />
          <span className={s.who}>
            <span className={s.name}>{identity.name}</span>
            <span className={s.role}>{identity.role}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
