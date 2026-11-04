/* The left navigation of the Seller and Admin tabs. The Buyer tab is a storefront and has none. Below 1024px it becomes a
   drawer that the toolbar's menu button opens. */
import { groupsOf, tabById } from '@/config/tabs.js'
import { cx } from '@/lib/cx.js'
import { useNav } from '@/stores/nav.js'
import Logo from '@/ui/Logo.jsx'
import s from './Sidebar.module.css'

export default function Sidebar() {
  const { tab, section, drawer, go } = useNav()
  const toggleDrawer = useNav((state) => state.toggleDrawer)
  const def = tabById(tab)
  if (!def?.sidebar) return null

  return (
    <>
      {drawer && <div className={s.scrim} onClick={() => toggleDrawer(false)} aria-hidden />}
      <aside className={s.sidebar} data-open={drawer} aria-label={`${def.label} navigation`}>
        <nav className={s.inner}>
          {groupsOf(def).map((group) => (
            <div key={group.label} className={s.group}>
              <p className={s.heading}>{group.label}</p>
              <ul>
                {group.sections.map(({ id, label, icon: Icon }) => {
                  const active = id === section
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className={cx(s.item, active && s.active)}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => go(tab, id)}
                      >
                        <Icon size={20} weight={active ? 'fill' : 'regular'} aria-hidden />
                        <span className={s.label}>{label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>
        <footer className={s.footer}>
          <Logo height={22} />
        </footer>
      </aside>
    </>
  )
}
