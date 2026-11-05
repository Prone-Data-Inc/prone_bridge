/* A stand-in for the data grid in tests: jsdom cannot lay out AG Grid, so this draws the same rows and columns as a plain
   table. A column's valueFormatter is applied, as it is when the real grid exports; a cell renderer is not. */
const cell = (column, row) => {
  const value = row[column.field]
  return column.valueFormatter ? column.valueFormatter({ value }) : String(value)
}

export default function FakeGrid({ rows, columns, onRowClick, getRowId, noun, exportName }) {
  return (
    <div data-testid="grid" data-noun={noun} data-export={exportName}>
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.field}>{column.headerName}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowId(row)} onClick={() => onRowClick?.(row)}>
              {columns.map((column) => (
                <td key={column.field}>{cell(column, row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
