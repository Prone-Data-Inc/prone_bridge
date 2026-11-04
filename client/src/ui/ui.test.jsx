// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import Avatar from './Avatar.jsx'
import Badge from './Badge.jsx'
import { Button, IconButton } from './Button.jsx'
import { Card, StatCard } from './Card.jsx'
import { Input, Select, Toggle } from './Field.jsx'
import Menu from './Menu.jsx'
import Modal from './Modal.jsx'
import PageHeader from './PageHeader.jsx'
import Segmented from './Segmented.jsx'
import { EmptyState, Skeleton, Spinner } from './States.jsx'
import Table from './Table.jsx'
import { MethodCell, MoneyCell, StatusCell } from './grid/cells.jsx'
import { Bell } from '@phosphor-icons/react'

describe('Button', () => {
  it('is a button that does not submit forms', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('type')).toBe('button')
  })

  it('is disabled and busy while loading, so it cannot be pressed twice', () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Saving' })
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('passes clicks through', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Go</Button>)
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('IconButton', () => {
  it('is named by its label', () => {
    render(<IconButton icon={Bell} label="Notifications" />)
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy()
  })

  it('shows a count, 9+ above nine, nothing for zero', () => {
    const { rerender } = render(<IconButton icon={Bell} label="Bell" badge={4} />)
    expect(screen.getByText('4')).toBeTruthy()
    rerender(<IconButton icon={Bell} label="Bell" badge={12} />)
    expect(screen.getByText('9+')).toBeTruthy()
    rerender(<IconButton icon={Bell} label="Bell" badge={0} />)
    expect(screen.queryByText('0')).toBeNull()
  })
})

describe('Badge and Avatar', () => {
  it('renders its text', () => {
    render(<Badge tone="success">Paid</Badge>)
    expect(screen.getByText('Paid')).toBeTruthy()
  })

  it('shows initials, and the same person always gets the same look', () => {
    const { container, rerender } = render(<Avatar name="Aminata Diallo" />)
    expect(container.textContent).toBe('AD')
    const first = container.firstChild.className
    rerender(<Avatar name="Aminata Diallo" />)
    expect(container.firstChild.className).toBe(first)
  })
})

describe('Card and StatCard', () => {
  it('shows a title, an action and the content', () => {
    render(
      <Card title="Volume" action={<button type="button">Export</button>}>
        Content
      </Card>,
    )
    expect(screen.getByRole('heading', { name: 'Volume' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy()
    expect(screen.getByText('Content')).toBeTruthy()
  })

  it('shows the value and a signed change', () => {
    const { rerender } = render(<StatCard label="Volume" value="$128,430" delta={0.124} />)
    expect(screen.getByText('$128,430')).toBeTruthy()
    expect(screen.getByText('+12.4%')).toBeTruthy()
    rerender(<StatCard label="Volume" value="$1" delta={-0.03} />)
    expect(screen.getByText('-3.0%')).toBeTruthy()
  })

  it('has no change when none is given', () => {
    render(<StatCard label="Payouts" value="$0" />)
    expect(screen.queryByText(/%/)).toBeNull()
  })
})

describe('Segmented', () => {
  const options = [
    { value: 'a', label: 'One' },
    { value: 'b', label: 'Two' },
    { value: 'c', label: 'Three' },
  ]

  function Harness() {
    const [value, setValue] = useState('a')
    return <Segmented label="Pick" value={value} onChange={setValue} options={options} />
  }

  it('is a radio group with one choice selected', () => {
    render(<Harness />)
    const group = screen.getByRole('radiogroup', { name: 'Pick' })
    expect(
      within(group)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('aria-checked')),
    ).toEqual(['true', 'false', 'false'])
  })

  it('changes on click and with the arrow keys, wrapping around', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('radio', { name: 'Two' }))
    expect(screen.getByRole('radio', { name: 'Two' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Two' }), { key: 'ArrowRight' })
    expect(screen.getByRole('radio', { name: 'Three' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Three' }), { key: 'ArrowRight' })
    expect(screen.getByRole('radio', { name: 'One' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(screen.getByRole('radio', { name: 'One' }), { key: 'ArrowLeft' })
    expect(screen.getByRole('radio', { name: 'Three' }).getAttribute('aria-checked')).toBe('true')
  })
})

describe('form fields', () => {
  it('connects the label to the input', () => {
    render(<Input label="Email" />)
    expect(screen.getByLabelText('Email').tagName).toBe('INPUT')
  })

  it('announces an error and marks the input invalid', () => {
    render(<Input label="Card number" error="Check the card number." />)
    const input = screen.getByLabelText('Card number')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('alert').textContent).toBe('Check the card number.')
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id)
  })

  it('describes the input with its hint', () => {
    render(<Input label="Email" hint="We send your receipt here." />)
    const input = screen.getByLabelText('Email')
    expect(document.getElementById(input.getAttribute('aria-describedby')).textContent).toBe(
      'We send your receipt here.',
    )
  })

  it('lists the options of a select', () => {
    render(
      <Select
        label="Country"
        defaultValue="NG"
        options={[
          { value: 'CI', label: "Côte d'Ivoire" },
          { value: 'NG', label: 'Nigeria' },
        ]}
      />,
    )
    expect(screen.getByLabelText('Country').value).toBe('NG')
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('is a switch that reports its state', () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} onChange={onChange} label="Mobile money" />)
    const toggle = screen.getByRole('switch', { name: 'Mobile money' })
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('cannot be switched when disabled', () => {
    const onChange = vi.fn()
    render(<Toggle checked onChange={onChange} label="Locked" disabled />)
    expect(screen.getByRole('switch', { name: 'Locked' }).disabled).toBe(true)
  })
})

describe('Modal', () => {
  it('shows nothing when closed', () => {
    render(
      <Modal open={false} title="Refund" onClose={() => {}}>
        Body
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is a labelled dialog, with focus moved inside', () => {
    render(
      <Modal open title="Refund this payment?" onClose={() => {}} footer={<Button>Confirm</Button>}>
        Are you sure?
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Refund this payment?' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('closes on Escape, on the close button and on a click outside', () => {
    const onClose = vi.fn()
    render(
      <Modal open title="Refund" onClose={onClose}>
        Body
      </Modal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.pointerDown(screen.getByRole('dialog').parentElement)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('does not close when the dialog itself is pressed', () => {
    const onClose = vi.fn()
    render(
      <Modal open title="Refund" onClose={onClose}>
        Body
      </Modal>,
    )
    fireEvent.pointerDown(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps Tab inside the dialog', () => {
    render(
      <Modal open title="Refund" onClose={() => {}} footer={<Button>Confirm</Button>}>
        <input aria-label="Reason" />
      </Modal>,
    )
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    confirm.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    screen.getByRole('button', { name: 'Close' }).focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(confirm)
  })

  it('gives focus back to where it was when it closes', () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <Modal open={open} title="Refund" onClose={() => setOpen(false)}>
            Body
          </Modal>
        </>
      )
    }
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open' })
    opener.focus()
    fireEvent.click(opener)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.activeElement).toBe(opener)
  })
})

describe('Menu', () => {
  it('opens a menu of actions, runs one and closes', () => {
    const onView = vi.fn()
    render(
      <Menu
        items={[{ label: 'View', onClick: onView }, false, { label: 'Refund', danger: true, onClick: () => {} }]}
      />,
    )
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    const menu = screen.getByRole('menu')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['View', 'Refund'])

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'View' }))
    expect(onView).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes on Escape and does not render without items', () => {
    const { container, rerender } = render(<Menu items={[{ label: 'View', onClick: () => {} }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()

    rerender(<Menu items={[false]} />)
    expect(container.textContent).toBe('')
  })

  it('does not let a click inside it reach the row it sits in', () => {
    const onRow = vi.fn()
    render(
      <div onClick={onRow}>
        <Menu items={[{ label: 'View', onClick: () => {} }]} />
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(onRow).not.toHaveBeenCalled()
  })
})

describe('Table', () => {
  const columns = [
    { key: 'country', label: 'Country' },
    { key: 'volume', label: 'Volume', align: 'right' },
  ]
  const rows = [
    { id: 1, country: 'Nigeria', volume: '$2,480' },
    { id: 2, country: 'Kenya', volume: '$980' },
  ]

  it('renders headers and rows', () => {
    render(<Table columns={columns} rows={rows} caption="Countries" />)
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Country', 'Volume'])
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByRole('table', { name: 'Countries' })).toBeTruthy()
  })

  it('makes rows clickable and keyboard friendly', () => {
    const onRowClick = vi.fn()
    render(<Table columns={columns} rows={rows} onRowClick={onRowClick} />)
    fireEvent.click(screen.getByText('Kenya'))
    expect(onRowClick).toHaveBeenCalledWith(rows[1])
    fireEvent.keyDown(screen.getByText('Nigeria').closest('tr'), { key: 'Enter' })
    expect(onRowClick).toHaveBeenCalledWith(rows[0])
  })

  it('says so when there is nothing', () => {
    render(<Table columns={columns} rows={[]} empty="No countries yet." />)
    expect(screen.getByText('No countries yet.')).toBeTruthy()
  })

  it('uses a custom renderer for a cell', () => {
    render(
      <Table
        columns={[{ key: 'country', label: 'Country', render: (row) => <b>{row.country.toUpperCase()}</b> }]}
        rows={rows}
      />,
    )
    expect(screen.getByText('NIGERIA')).toBeTruthy()
  })
})

describe('states and headers', () => {
  it('shows an empty state with its message and action', () => {
    render(
      <EmptyState icon={Bell} title="No payments yet" action={<button type="button">Share link</button>}>
        Sales show up here.
      </EmptyState>,
    )
    expect(screen.getByRole('heading', { name: 'No payments yet' })).toBeTruthy()
    expect(screen.getByText('Sales show up here.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Share link' })).toBeTruthy()
  })

  it('shows a spinner that screen readers can name, and hides skeletons from them', () => {
    const { container } = render(
      <>
        <Spinner label="Loading payments" />
        <Skeleton />
      </>,
    )
    expect(screen.getByRole('status', { name: 'Loading payments' })).toBeTruthy()
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })

  it('shows a page header', () => {
    render(<PageHeader title="Payments" subtitle="Every payment." actions={<button type="button">Export</button>} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Payments' })).toBeTruthy()
    expect(screen.getByText('Every payment.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy()
  })
})

describe('grid cells', () => {
  it('shows a status as a labelled pill', () => {
    render(<StatusCell value="in_review" />)
    expect(screen.getByText('In review')).toBeTruthy()
  })

  it('labels a simulated method, and not a real one', () => {
    const { rerender } = render(<MethodCell value="Mobile money" data={{ simulated: true }} />)
    expect(screen.getByText('Simulated')).toBeTruthy()
    rerender(<MethodCell value="PayPal" data={{ simulated: false }} />)
    expect(screen.queryByText('Simulated')).toBeNull()
  })

  it('formats money from cents', () => {
    render(<MoneyCell value={4900} />)
    expect(screen.getByText('$49.00')).toBeTruthy()
  })
})
