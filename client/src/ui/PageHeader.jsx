/* The title row at the top of a page: title, one short line, actions on the right. */
import s from './PageHeader.module.css'

export default function PageHeader({ title, subtitle, actions }) {
  return (
    <header className={s.header}>
      <div className={s.text}>
        <h1 className={s.title}>{title}</h1>
        {subtitle && <p className={s.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={s.actions}>{actions}</div>}
    </header>
  )
}
