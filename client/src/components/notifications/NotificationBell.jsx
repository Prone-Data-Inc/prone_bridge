/* The bell in the toolbar. It shows the unread count of the open tab and, when opened, that tab's notifications. The
   other tabs show their own counts on the tab strip, and every new notification also appears as a toast. */
import { useCallback, useRef, useState } from 'react'
import { Bell, BellSlash, CheckCircle, Info, Warning, WarningCircle } from '@phosphor-icons/react'
import { tabById } from '@/config/tabs.js'
import { useNow } from '@/hooks/useNow.js'
import { cx } from '@/lib/cx.js'
import { timeAgo } from '@/lib/format.js'
import { useNav } from '@/stores/nav.js'
import { useNotifications } from '@/stores/notifications.js'
import { Button, IconButton } from '@/ui/Button.jsx'
import { Popover } from '@/ui/Floating.jsx'
import { EmptyState, Skeleton } from '@/ui/States.jsx'
import s from './NotificationBell.module.css'

/* One shared empty list: a new [] on every render would make the store think the value keeps changing. */
const NONE = []

const ICONS = { info: Info, success: CheckCircle, warning: Warning, danger: WarningCircle }

export default function NotificationBell() {
  const tab = useNav((state) => state.tab)
  const audience = tabById(tab)?.audience
  const [open, setOpen] = useState(false)
  const anchor = useRef(null)
  const close = useCallback(() => setOpen(false), [])
  const now = useNow()

  const items = useNotifications((state) => state.items[audience] ?? NONE)
  const unread = useNotifications((state) => state.unread[audience] ?? 0)
  const loaded = useNotifications((state) => state.loaded[audience])
  const error = useNotifications((state) => state.error)
  const { load, markRead } = useNotifications.getState()

  if (!audience) return null

  const toggle = () => {
    if (!open) load(audience)
    setOpen((value) => !value)
  }

  return (
    <div ref={anchor} className={s.wrap}>
      <IconButton
        icon={Bell}
        label={unread ? `Notifications, ${unread} new` : 'Notifications'}
        badge={unread}
        active={open}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
      />
      <Popover
        anchorRef={anchor}
        open={open}
        onClose={close}
        className={s.panel}
        role="dialog"
        aria-label="Notifications"
      >
        <header className={s.header}>
          <h2 className={s.title}>Notifications</h2>
          <Button size="sm" variant="ghost" disabled={!unread} onClick={() => markRead(audience)}>
            Mark all read
          </Button>
        </header>

        <div className={s.body}>
          {!loaded && !error && (
            <div className={s.skeletons}>
              {[0, 1, 2].map((key) => (
                <Skeleton key={key} height={56} radius={10} />
              ))}
            </div>
          )}
          {!loaded && error && (
            <EmptyState icon={BellSlash} title="Could not load">
              We could not reach the server. It will try again shortly.
            </EmptyState>
          )}
          {loaded && !items.length && (
            <EmptyState icon={Bell} title={audience === 'buyer' ? 'Nothing yet' : 'All caught up'}>
              {audience === 'buyer' ? 'Updates about your purchases show up here.' : 'New activity will show up here.'}
            </EmptyState>
          )}
          {loaded && items.length > 0 && (
            <ul className={s.list}>
              {items.map((item) => {
                const Icon = ICONS[item.level] ?? Info
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={cx(s.item, !item.readAt && s.unread)}
                      onClick={() => !item.readAt && markRead(audience, [item.id])}
                    >
                      <Icon size={20} weight="fill" className={cx(s.icon, s[item.level])} aria-hidden />
                      <span className={s.text}>
                        <span className={s.itemTitle}>{item.title}</span>
                        <span className={s.itemBody}>{item.body}</span>
                        <span className={s.time}>{timeAgo(item.createdAt, now)}</span>
                      </span>
                      {!item.readAt && <span className={s.dot} aria-label="Unread" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Popover>
    </div>
  )
}
