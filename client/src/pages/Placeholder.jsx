/* Stands in for a page that a later step builds. */
import { sectionOf } from '@/config/tabs.js'
import { EmptyState } from '@/ui/States.jsx'
import PageHeader from '@/ui/PageHeader.jsx'
import s from './Page.module.css'

export default function Placeholder({ tab, section }) {
  const def = sectionOf(tab, section)
  return (
    <div className={s.page}>
      <PageHeader title={def.label} subtitle={def.subtitle} />
      <div className={s.center}>
        <EmptyState icon={def.icon} title="Coming up">
          This page is built in step {def.step}.
        </EmptyState>
      </div>
    </div>
  )
}
