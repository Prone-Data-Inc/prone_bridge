/* The AG Grid theme: Quartz, with every color, size and font taken from our design tokens. Because the values are CSS
   variables, the grid follows the light and dark themes with no extra code. */
import { themeQuartz } from 'ag-grid-community'

export const gridTheme = themeQuartz.withParams({
  accentColor: 'var(--accent)',
  backgroundColor: 'var(--bg)',
  foregroundColor: 'var(--text)',
  borderColor: 'var(--border)',
  chromeBackgroundColor: 'var(--bg)',
  headerBackgroundColor: 'var(--surface)',
  headerTextColor: 'var(--text-3)',
  rowHoverColor: 'var(--fill)',
  selectedRowBackgroundColor: 'var(--accent-soft)',
  fontFamily: 'var(--font)',
  fontSize: 14,
  headerFontSize: 12,
  headerFontWeight: 500,
  rowHeight: 48,
  headerHeight: 40,
  spacing: 8,
  cellHorizontalPadding: 16,
  wrapperBorderRadius: 16,
  browserColorScheme: 'inherit',
})
