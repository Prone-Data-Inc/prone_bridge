/* The frame of Prone Data Learning's storefront: its look, its header and its footer around a page. This is the seller's
   own site, shown inside the Buyer tab. Checkout, which is ProneBridge's, does not use it. */
import { BookOpen } from '@phosphor-icons/react'
import { cx } from '@/lib/cx.js'
import { hashFor, useNav } from '@/stores/nav.js'
import { useLearner } from '@/stores/learner.js'
import { useSession } from '@/stores/session.js'
import { useTheme } from '@/stores/theme.js'
import Avatar from '@/ui/Avatar.jsx'
import s from './Pdl.module.css'

export function PdlLogo({ height }) {
  const theme = useTheme((state) => state.theme)
  return (
    <img
      className={s.logo}
      style={height ? { height } : undefined}
      src={theme === 'dark' ? '/pdl/learning-horizontal-dark.svg' : '/pdl/learning-horizontal.svg'}
      alt="Prone Data Learning"
    />
  )
}

export default function PdlFrame({ children }) {
  const section = useNav((state) => state.sections.buyer)
  const buyer = useSession((state) => state.buyer)
  const owned = useLearner((state) => state.courses.length)

  return (
    <div className={s.skin}>
      <header className={s.header}>
        <div className={cx(s.container, s.bar)}>
          <a className={s.brand} href={hashFor('buyer', 'home')} aria-label="Prone Data Learning, all courses">
            <PdlLogo />
          </a>
          <nav className={s.nav} aria-label="Prone Data Learning">
            <a className={cx(s.link, section === 'home' && s.current)} href={hashFor('buyer', 'home')}>
              Courses
            </a>
            <a className={cx(s.link, section === 'learn' && s.current)} href={hashFor('buyer', 'learn')}>
              <BookOpen size={16} aria-hidden />
              My courses
              {owned > 0 && (
                <span className={s.count} aria-label={`${owned} unlocked`}>
                  {owned}
                </span>
              )}
            </a>
            {buyer && (
              <span className={s.who}>
                <Avatar name={buyer.name} size={30} />
              </span>
            )}
          </nav>
        </div>
      </header>
      {children}
      <footer className={s.footer}>
        <div className={cx(s.container, s.footerRow)}>
          <span>Demo storefront. Prices in US dollars. At checkout, buyers pay in their own currency.</span>
          <span>Prone Data Learning</span>
        </div>
      </footer>
    </div>
  )
}
