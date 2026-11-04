// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BarChart from './BarChart.jsx'
import DonutChart from './DonutChart.jsx'
import Legend from './Legend.jsx'
import LineChart from './LineChart.jsx'
import MeterList from './MeterList.jsx'
import Sparkline from './Sparkline.jsx'

const usd = (value) => `$${value}`

describe('LineChart', () => {
  const props = {
    labels: ['1', '2', '3', '4'],
    caption: 'Volume by day',
    format: usd,
    series: [
      { label: 'This period', values: [10, 40, 30, 80], color: 'red', area: true },
      { label: 'Last period', values: [5, 20, 25, 40], color: 'gray', dashed: true },
    ],
  }

  it('draws one line per series', () => {
    const { container } = render(<LineChart {...props} />)
    expect(container.querySelectorAll('svg path[stroke]')).toHaveLength(2)
  })

  it('gives screen readers a table with every value', () => {
    render(<LineChart {...props} />)
    const table = screen.getByRole('table', { name: 'Volume by day', hidden: true })
    expect(within(table).getAllByRole('row', { hidden: true })).toHaveLength(5)
    expect(within(table).getByText('$80', { exact: true })).toBeTruthy()
  })

  it('shows a tooltip with both series when you point at it, and hides it again', () => {
    const { container } = render(<LineChart {...props} />)
    const svg = container.querySelector('svg')
    fireEvent.pointerMove(svg, { clientX: 400 })
    const tip = screen.getByRole('status')
    expect(within(tip).getByText('This period')).toBeTruthy()
    expect(within(tip).getByText('Last period')).toBeTruthy()
    fireEvent.pointerLeave(svg)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('points at the same value on a zoomed screen, where the browser measures in bigger pixels', () => {
    /* The chart is drawn 480 wide. On a screen zoomed to 1.5 the browser says it is 720 wide and starts at 100. */
    const tip = (zoom, clientX) => {
      const { container, unmount } = render(<LineChart {...props} />)
      const svg = container.querySelector('svg')
      svg.getBoundingClientRect = () => ({ left: 100 * zoom, width: 480 * zoom })
      fireEvent.pointerMove(svg, { clientX })
      const shown = within(screen.getByRole('status')).getAllByText(/^\d$/)[0].textContent
      unmount()
      return shown
    }
    /* the same spot on the chart, 300 from its left edge, whatever the zoom */
    expect(tip(1.5, 100 * 1.5 + 300 * 1.5)).toBe(tip(1, 100 + 300))
    expect(tip(2, 100 * 2 + 40 * 2)).toBe(tip(1, 100 + 40))
  })

  it('moves a crosshair with the arrow keys', () => {
    render(<LineChart {...props} />)
    const chart = screen.getByLabelText('Volume by day')
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    expect(within(screen.getByRole('status')).getByText('1')).toBeTruthy()
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    expect(within(screen.getByRole('status')).getByText('2')).toBeTruthy()
    fireEvent.blur(chart)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('says there is no data instead of drawing nothing, and survives one point', () => {
    const { rerender } = render(
      <LineChart {...props} labels={[]} series={[{ label: 'x', values: [], color: 'red' }]} />,
    )
    expect(screen.getByText('No data yet.')).toBeTruthy()
    rerender(<LineChart {...props} labels={['1']} series={[{ label: 'x', values: [5], color: 'red' }]} />)
    expect(screen.queryByText('No data yet.')).toBeNull()
  })

  it('survives all zeros', () => {
    const { container } = render(<LineChart {...props} series={[{ label: 'x', values: [0, 0, 0, 0], color: 'red' }]} />)
    expect(container.innerHTML).not.toContain('NaN')
  })
})

describe('BarChart', () => {
  const data = [
    { label: 'Mon', value: 10 },
    { label: 'Tue', value: 30 },
    { label: 'Wed', value: 20 },
  ]

  it('draws a column for each value and names the peak', () => {
    const { container } = render(
      <BarChart data={data} seriesLabel="Payments" format={usd} caption="Payments per day" />,
    )
    expect(container.querySelectorAll('svg path')).toHaveLength(3)
    expect(container.querySelector('svg').textContent).toContain('$30')
  })

  it('lets keyboard users reach each column and read it', () => {
    render(<BarChart data={data} seriesLabel="Payments" format={usd} caption="Payments per day" />)
    const column = screen.getByLabelText('Tue: $30')
    fireEvent.focus(column)
    const tip = screen.getByRole('status')
    expect(within(tip).getByText('Payments')).toBeTruthy()
    fireEvent.blur(column)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('has a table twin and handles no data and zeros', () => {
    const { container, rerender } = render(
      <BarChart data={data} seriesLabel="Payments" format={usd} caption="Payments per day" />,
    )
    expect(screen.getByRole('table', { hidden: true }).textContent).toContain('Wed')
    rerender(<BarChart data={[]} seriesLabel="Payments" format={usd} caption="x" />)
    expect(screen.getByText('No data yet.')).toBeTruthy()
    rerender(<BarChart data={[{ label: 'a', value: 0 }]} seriesLabel="P" format={usd} caption="x" />)
    expect(container.innerHTML).not.toContain('NaN')
  })
})

describe('DonutChart', () => {
  const data = [
    { label: 'Mobile money', value: 60, color: 'blue' },
    { label: 'Card', value: 30, color: 'gold' },
    { label: 'PayPal', value: 10, color: 'teal' },
  ]

  it('lists every part with its value and share', () => {
    render(<DonutChart data={data} format={usd} center={{ value: '$100', label: 'Volume' }} caption="Methods" />)
    const group = screen.getByRole('group', { name: 'Methods' })
    expect(within(group).getByText('60.0%')).toBeTruthy()
    expect(within(group).getByText('30.0%')).toBeTruthy()
    expect(within(group).getByText('$10')).toBeTruthy()
  })

  it('shows the total in the centre, and a part when you point at it', () => {
    render(<DonutChart data={data} format={usd} center={{ value: '$100', label: 'Volume' }} caption="Methods" />)
    expect(screen.getByText('$100')).toBeTruthy()
    const row = screen.getByText('Card').closest('li')
    fireEvent.pointerEnter(row)
    expect(screen.getAllByText('Card').length).toBeGreaterThan(1)
    expect(screen.getAllByText('30.0%').length).toBeGreaterThan(1)
    fireEvent.pointerLeave(row)
    expect(screen.getByText('Volume')).toBeTruthy()
  })

  it('handles no value at all', () => {
    const { container } = render(
      <DonutChart
        data={[{ label: 'None', value: 0, color: 'red' }]}
        format={usd}
        center={{ value: '$0', label: 'Volume' }}
        caption="x"
      />,
    )
    expect(container.innerHTML).not.toContain('NaN')
  })
})

describe('MeterList, Legend and Sparkline', () => {
  it('ranks bars against the largest value', () => {
    const { container } = render(
      <MeterList
        data={[
          { label: 'Nigeria', value: 200 },
          { label: 'Kenya', value: 50 },
        ]}
        format={usd}
        caption="Volume by country"
      />,
    )
    expect(screen.getByRole('list', { name: 'Volume by country' })).toBeTruthy()
    const widths = [...container.querySelectorAll('li > span:nth-child(2) > span')].map((bar) => bar.style.width)
    expect(widths).toEqual(['100%', '25%'])
  })

  it('does not divide by zero in a list of zeros', () => {
    const { container } = render(<MeterList data={[{ label: 'None', value: 0 }]} format={usd} caption="x" />)
    expect(container.innerHTML).not.toContain('NaN')
  })

  it('lists legend items', () => {
    render(
      <Legend
        items={[
          { label: 'This period', color: 'red' },
          { label: 'Last period', color: 'gray', dashed: true },
        ]}
      />,
    )
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['This period', 'Last period'])
  })

  it('draws a sparkline, named when given a caption', () => {
    const { container } = render(<Sparkline values={[1, 3, 2, 5]} caption="Volume over 30 days" />)
    expect(screen.getByRole('img', { name: 'Volume over 30 days' })).toBeTruthy()
    expect(container.querySelectorAll('path').length).toBe(2)
  })

  it('survives a flat or single value', () => {
    const { container, rerender } = render(<Sparkline values={[4, 4, 4]} />)
    expect(container.innerHTML).not.toContain('NaN')
    rerender(<Sparkline values={[4]} />)
    expect(container.querySelector('path')).toBeNull()
  })
})
