/* Chrome-style tab strip with three fixed tabs: Buyer, Seller, Admin. They cannot be closed, moved or added, they are
   the three roles of the demo. A number on a tab you are not on means something happened there. */
import { TABS } from '@/config/tabs.js'
import { cx } from '@/lib/cx.js'
import { useNav } from '@/stores/nav.js'
import { useNotifications } from '@/stores/notifications.js'
import DemoNotice from './DemoNotice.jsx'
import LiveStatus from './LiveStatus.jsx'
import s from './TabStrip.module.css'

export default function TabStrip() {
  const active = useNav((state) => state.tab)
  const go = useNav((state) => state.go)
  const unread = useNotifications((state) => state.unread)

  const onKeyDown = (event, index) => {
    const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 }[event.key]
    if (target === undefined) return
    event.preventDefault()
    const next = TABS[(target + TABS.length) % TABS.length]
    go(next.id)
    document.getElementById(`tab-${next.id}`)?.focus()
  }

  return (
    <div className={s.strip}>
      <div className={s.tabs} role="tablist" aria-label="Workspace">
        {TABS.map(({ id, label, icon: Icon, audience }, index) => {
          const selected = id === active
          const count = selected ? 0 : unread[audience]
          return (
            <button
              key={id}
              id={`tab-${id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`workspace-${id}`}
              tabIndex={selected || (!active && index === 0) ? 0 : -1}
              className={cx(s.tab, selected && s.active)}
              onClick={() => go(id)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <span className={s.divider} aria-hidden />
              <span className={s.hover} aria-hidden />
              <Icon size={16} weight={selected ? 'fill' : 'regular'} className={s.favicon} aria-hidden />
              <span className={s.title}>{label}</span>
              {count > 0 && (
                <span className={s.count} aria-label={`${count} new`}>
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className={s.trailing}>
        <LiveStatus />
        <DemoNotice />
      </div>
    </div>
  )
}
