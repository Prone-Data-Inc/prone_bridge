/* DataGrid, fetched on first use. Until it arrives, a skeleton of the right height holds the place. */
import { lazy, Suspense } from 'react'
import { Skeleton } from './States.jsx'

const DataGrid = lazy(() => import('./DataGrid.jsx'))

export default function LazyDataGrid(props) {
  return (
    <Suspense fallback={<Skeleton height={(props.height ?? 560) + 44} radius={16} />}>
      <DataGrid {...props} />
    </Suspense>
  )
}
