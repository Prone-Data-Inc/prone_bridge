/* The data grid for long lists (payments, customers, payouts, audit log): AG Grid Community, themed with our tokens.
   It gives sorting, per column filters, resizing, pagination, keyboard navigation, quick search and CSV export.
   Load it through LazyDataGrid so the grid code is only fetched on pages that show one. */
import { useMemo, useRef, useState } from 'react'
import { AllCommunityModule } from 'ag-grid-community'
import { AgGridProvider, AgGridReact } from 'ag-grid-react'
import { DownloadSimple, MagnifyingGlass } from '@phosphor-icons/react'
import { Button } from './Button.jsx'
import { gridTheme } from './grid/theme.js'
import s from './DataGrid.module.css'

const modules = [AllCommunityModule]

export default function DataGrid({
  rows,
  columns,
  getRowId,
  onRowClick,
  height = 560,
  pageSize = 10,
  exportName = 'export',
  searchPlaceholder = 'Search',
  noun = 'rows',
  loading = false,
}) {
  const api = useRef(null)
  const [search, setSearch] = useState('')
  const [shown, setShown] = useState(rows.length)

  const defaultColDef = useMemo(() => ({ sortable: true, resizable: true, filter: true, suppressMovable: true }), [])
  const countRows = () => setShown(api.current?.getDisplayedRowCount() ?? rows.length)

  return (
    <div className={s.wrap}>
      <div className={s.bar}>
        <label className={s.search}>
          <MagnifyingGlass size={16} aria-hidden />
          <input
            type="search"
            value={search}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <span className={s.count}>
          {shown.toLocaleString('en-US')} {noun}
        </span>
        <Button
          size="sm"
          icon={DownloadSimple}
          onClick={() => api.current?.exportDataAsCsv({ fileName: `${exportName}.csv` })}
        >
          Export
        </Button>
      </div>

      <div className={s.grid} style={{ height }}>
        <AgGridProvider modules={modules}>
          <AgGridReact
            theme={gridTheme}
            rowData={rows}
            columnDefs={columns}
            defaultColDef={defaultColDef}
            getRowId={getRowId && ((params) => getRowId(params.data))}
            quickFilterText={search}
            pagination
            paginationPageSize={pageSize}
            paginationPageSizeSelector={false}
            loading={loading}
            animateRows
            onGridReady={(event) => {
              api.current = event.api
              countRows()
            }}
            onModelUpdated={countRows}
            onRowClicked={onRowClick && ((event) => onRowClick(event.data))}
          />
        </AgGridProvider>
      </div>
    </div>
  )
}
