/* A plain table for short lists, driven by a column config: { key, label, align, render }. Rows can be clickable.
   Long, sortable, filterable lists use DataGrid instead. */
import { cx } from '@/lib/cx.js'
import s from './Table.module.css'

export default function Table({ columns, rows, caption, onRowClick, empty = 'Nothing here yet.' }) {
  return (
    <div className={s.scroll}>
      <table className={s.table}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={s[column.align]} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={cx(onRowClick && s.clickable)}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick && (() => onRowClick(row))}
              onKeyDown={onRowClick && ((event) => event.key === 'Enter' && onRowClick(row))}
            >
              {columns.map((column) => (
                <td key={column.key} className={s[column.align]}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className={s.empty}>{empty}</p>}
    </div>
  )
}
