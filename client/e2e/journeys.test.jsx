// @vitest-environment jsdom
/* End to end: whole journeys through the real app, the real API and a real Postgres. Nothing about the product is mocked.
   Each journey is something a judge or a customer would do, across the three tabs, and ends by checking the database too. */
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/ui/LazyDataGrid.jsx', async () => ({ default: (await import('../test/fakeGrid.jsx')).default }))
vi.mock('@/lib/reload.js', () => ({ reloadApp: vi.fn() }))

const { startStack, resetClient, aiNote } = await import('./stack.js')
const { default: App } = await import('@/App.jsx')
const { reloadApp } = await import('@/lib/reload.js')
const { timing } = await import('@/pages/buyer/checkout/simulation.js')

const SLOW = { timeout: 15_000 }
/* A whole app, an API and a database share one process here, so a busy machine can take longer than the default second. */
configure({ asyncUtilTimeout: 15_000 })
let stack
let counter = 0

beforeAll(async () => {
  stack = await startStack()
  timing.waitMs = 0
}, 120_000)
afterAll(() => stack.stop())

beforeEach(async () => {
  cleanup()
  resetClient()
  reloadApp.mockReset()
  await stack.calm()
  stack.openai.respond.mockReset().mockImplementation(async () => aiNote())
})

const open = (hash) => {
  window.location.hash = hash
  return render(<App />)
}
const tab = (name) => fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }))
const go = (hash) => {
  window.location.hash = hash
}
const email = (kind) => `e2e.${kind}.${Date.now()}.${++counter}@${kind === 'risky' ? 'mailinator.com' : 'example.com'}`

/* A buyer on the checkout: waits for Method Match, fills in who they are, presses Pay. */
async function payAs(address, name = 'Journey Buyer') {
  await screen.findByText('Best match first', undefined, SLOW)
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: address } })
  await waitFor(() => expect(screen.getByRole('button', { name: /^Pay / }).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: /^Pay / }))
}
const heading = (name) => screen.findByRole('heading', { name }, SLOW)

/* The reference of the payment a buyer just made, read from the database. */
const latest = (status) =>
  stack.one('select id, reference, status from public.payments where status = $1 order by created_at desc limit 1', [
    status,
  ])

describe('a buyer pays, and the seller and the admin see it', () => {
  it('buys the course with the best method, and it shows in the seller and admin tabs', async () => {
    const buyer = email('sale')
    open('#/buyer/checkout/ai-for-work')
    await payAs(buyer)
    await heading("You're in")
    expect(screen.getByText('AI for Work is unlocked. A receipt is in your notifications.')).toBeTruthy()

    const payment = await stack.one(
      `select p.*, b.email from public.payments p join public.buyers b on b.id = p.buyer_id where b.email = $1`,
      [buyer],
    )
    expect(payment).toMatchObject({ status: 'succeeded', origin: 'app', provider: 'simulated' })
    expect(await stack.count('enrollments', 'payment_id = $1', [payment.id])).toBe(1)
    expect(await stack.count('risk_assessments', "payment_id = $1 and level = 'low'", [payment.id])).toBe(1)

    tab('Seller')
    go('#/seller/payments')
    const sellerGrid = await screen.findByTestId('grid', undefined, SLOW)
    expect(await within(sellerGrid).findByText(buyer, undefined, SLOW)).toBeTruthy()

    tab('Admin')
    go('#/admin/transactions')
    /* the seller's grid is still there, hidden, so the admin's is the one that exports "transactions" */
    const adminGrid = await waitFor(() => {
      const found = screen.getAllByTestId('grid').find((grid) => grid.dataset.export === 'transactions')
      expect(found).toBeTruthy()
      return found
    }, SLOW)
    const row = (await within(adminGrid).findByText(buyer, undefined, SLOW)).closest('tr')
    expect(within(row).getByText('Paid')).toBeTruthy()
    expect(within(row).getByText('Low')).toBeTruthy()
  }, 60_000)

  it('leads from the storefront to a course to the checkout', async () => {
    open('#/buyer/home')
    fireEvent.click((await screen.findAllByRole('link', { name: /AI for Work/ }, SLOW))[0])
    const buy = await screen.findByRole('button', { name: /Buy this course/ }, SLOW)
    fireEvent.click(buy)
    expect(await screen.findByText('Best match first', undefined, SLOW)).toBeTruthy()
    expect(window.location.hash).toBe('#/buyer/checkout/ai-for-work')
  }, 60_000)

  it('never shows "already bought": a visitor whose email already owns the course carries on as a new demo buyer', async () => {
    const owner = email('owner')
    open('#/buyer/checkout/ai-for-work')
    await payAs(owner)
    await heading("You're in")

    /* another visitor, in another browser, types the same email for the same course */
    cleanup()
    resetClient()
    open('#/buyer/checkout/ai-for-work')
    await payAs(owner)
    await heading("You're in")

    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.body.textContent).not.toMatch(/already own/i)
    const second = await stack.one(
      'select b.email, p.status from public.payments p join public.buyers b on b.id = p.buyer_id order by p.created_at desc limit 1',
    )
    expect(second.status).toBe('succeeded')
    expect(second.email).toMatch(/^aminata\.kone\d{4}@example\.com$/)
    expect(second.email).not.toBe(owner)
    /* two different buyers each own the course, and the first still has theirs */
    expect(
      await stack.count(
        'enrollments e join public.products pr on pr.id = e.product_id join public.buyers b on b.id = e.buyer_id',
        'pr.slug = $1 and (b.email = $2 or b.email = $3)',
        ['ai-for-work', owner, second.email],
      ),
    ).toBe(2)
  }, 90_000)
})

describe('a payment goes wrong, and the buyer tries again', () => {
  it('is declined with a plain message, nothing is charged, and a second try goes through', async () => {
    const buyer = email('retry')
    open('#/buyer/checkout/ai-for-work')
    await screen.findByText('Best match first', undefined, SLOW)
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Retry Buyer' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: buyer } })
    fireEvent.click(screen.getByRole('radio', { name: 'Decline' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Pay / }).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /^Pay / }))
    await heading('Payment did not go through')
    expect(screen.getAllByText(/Nothing was charged\./).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Pay / })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /^Pay / }))
    await heading("You're in")

    const made = await stack.db.query(
      'select p.status from public.payments p join public.buyers b on b.id = p.buyer_id where b.email = $1 order by p.created_at, p.id',
      [buyer],
    )
    expect(made.map((row) => row.status)).toEqual(['failed', 'succeeded'])
    /* a failed attempt is not a fraud signal: nothing was held */
    expect(
      await stack.count('payments', "status in ('in_review', 'blocked') and created_at > now() - interval '1 minute'"),
    ).toBe(0)
  }, 60_000)
})

describe('the seller is paid, and sells through a link', () => {
  const unpaid = () =>
    stack.one(
      "select count(*)::int as n from public.payments where status = 'succeeded' and payout_id is null and merchant_id = (select id from public.merchants where slug = 'pdl')",
    )
  const json = (body) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  it('pays out what the seller is owed from the Payouts page', async () => {
    expect((await unpaid()).n).toBeGreaterThan(0)
    open('#/seller/payouts')
    await screen.findByText('Waiting for a payout', undefined, SLOW)
    const pay = await screen.findByRole('button', { name: 'Pay out now' }, SLOW)
    await waitFor(() => expect(pay.disabled).toBe(false), SLOW)
    fireEvent.click(pay)
    expect(await screen.findByText(/is on its way to you\./, undefined, SLOW)).toBeTruthy()
    expect((await unpaid()).n).toBe(0)
    expect(
      await stack.count('payouts', "origin = 'app' and status = 'paid' and provider = 'simulated'"),
    ).toBeGreaterThan(0)
  }, 60_000)

  it('shares a payment link, a buyer buys through it, and the seller can see the sale came from it', async () => {
    const created = await fetch('/api/seller/links', {
      method: 'POST',
      ...json({ product: 'ai-for-work', title: 'E2E launch link' }),
    })
    const link = (await created.json()).data.link
    const buyer = email('link')

    open(`#/buyer/link/${link.code}`)
    expect(await screen.findByText('E2E launch link', undefined, SLOW)).toBeTruthy()
    await payAs(buyer, 'Link Buyer')
    await heading("You're in")

    const sale = await stack.one(
      'select p.link_id, p.status from public.payments p join public.buyers b on b.id = p.buyer_id where b.email = $1',
      [buyer],
    )
    expect(sale).toEqual({ link_id: link.id, status: 'succeeded' })
    const seen = (await (await fetch('/api/seller/links')).json()).data.links.find((entry) => entry.id === link.id)
    expect(seen).toMatchObject({ paid: 1, visits: 1 })

    tab('Seller')
    go('#/seller/links')
    expect(await screen.findByText('E2E launch link', undefined, SLOW)).toBeTruthy()
  }, 60_000)

  it('says a paused link cannot be used', async () => {
    const made = await fetch('/api/seller/links', {
      method: 'POST',
      ...json({ product: 'ai-for-work', title: 'Paused link' }),
    })
    const link = (await made.json()).data.link
    await fetch(`/api/seller/links/${link.id}`, { method: 'PATCH', ...json({ active: false }) })
    open(`#/buyer/link/${link.code}`)
    expect(await screen.findByText('This link cannot be used', undefined, SLOW)).toBeTruthy()
  }, 60_000)
})

describe('the safety check holds a payment, and a person decides', () => {
  it('holds a throwaway email, the admin approves, and the same payment goes on', async () => {
    const buyer = email('risky')
    open('#/buyer/checkout/ai-for-work')
    await payAs(buyer)
    await heading('We are checking your payment')
    const held = await latest('in_review')
    expect(await stack.count('payments', 'reference = $1 and provider_order_id is null', [held.reference])).toBe(1)

    /* the admin finds it in the queue, with the AI's note, and approves it */
    tab('Admin')
    go('#/admin/review')
    const card = await screen.findByRole('article', { name: `Payment ${held.reference}` }, SLOW)
    expect(within(card).getByText('Throwaway email')).toBeTruthy()
    await waitFor(() => expect(within(card).getByText("Written by AI from the rules' findings")).toBeTruthy(), SLOW)
    fireEvent.click(within(card).getByRole('button', { name: /Approve/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Approve this payment' })
    fireEvent.change(within(dialog).getByLabelText('Note (optional)'), { target: { value: 'Checked by hand' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(screen.queryByRole('article', { name: `Payment ${held.reference}` })).toBeNull(), SLOW)

    /* the buyer's page moved on by itself, and the same payment is finished */
    tab('Buyer')
    await heading('The check is done')
    fireEvent.click(screen.getByRole('button', { name: 'Continue to pay' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Pay / })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /^Pay / }))
    await heading("You're in")

    const done = await stack.one('select status, reference from public.payments where reference = $1', [held.reference])
    expect(done.status).toBe('succeeded')
    expect(await stack.count('audit_log', "action = 'risk.approved' and entity_id = $1", [held.id])).toBe(1)
    expect(
      await stack.count(
        'risk_assessments',
        "payment_id = $1 and review_decision = 'approved' and review_note = 'Checked by hand'",
        [held.id],
      ),
    ).toBe(1)
  }, 90_000)

  it('rejects a held payment: the buyer is stopped in plain words, and the seller is told', async () => {
    const buyer = email('risky')
    open('#/buyer/checkout/ai-for-work')
    await payAs(buyer)
    await heading('We are checking your payment')
    const held = await latest('in_review')

    tab('Admin')
    go('#/admin/review')
    const card = await screen.findByRole('article', { name: `Payment ${held.reference}` }, SLOW)
    fireEvent.click(within(card).getByRole('button', { name: 'Reject' }))
    const dialog = await screen.findByRole('dialog', { name: 'Reject this payment' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }))

    tab('Buyer')
    await heading('Payment not completed')
    /* the page says it, and so may the notification toast, depending on how fast the live update arrives */
    expect(screen.getAllByText('A safety check stopped this payment. Nothing was charged.').length).toBeGreaterThan(0)
    /* what the buyer sees: their own tab, and the messages sent to them. The admin's tab, kept alive behind it, may say more. */
    expect(document.getElementById('workspace-buyer').textContent).not.toMatch(/throwaway|score|risk|rule/i)
    const told = await stack.db.query(
      "select title, body from public.notifications where payment_id = $1 and audience = 'buyer'",
      [held.id],
    )
    expect(JSON.stringify(told)).not.toMatch(/throwaway|score|risk|rule/i)
    expect(await stack.count('enrollments', 'payment_id = $1', [held.id])).toBe(0)
    expect(
      await stack.count('notifications', "payment_id = $1 and kind = 'risk.rejected' and audience = 'seller'", [
        held.id,
      ]),
    ).toBe(1)
    expect(await stack.one('select status, failure_code from public.payments where id = $1', [held.id])).toEqual({
      status: 'blocked',
      failure_code: 'safety_check',
    })
  }, 90_000)
})

describe('the admin changes the network, and the buyer sees it', () => {
  it("marks Mobile money in Côte d'Ivoire down: the next buyer no longer sees it, and the seller was told", async () => {
    open('#/admin/corridors')
    const health = await screen.findByLabelText("Health of Mobile money in Côte d'Ivoire", undefined, SLOW)
    const told = await stack.count('notifications', "kind = 'corridor'")
    fireEvent.change(health, { target: { value: 'down' } })
    await waitFor(
      async () =>
        expect(
          await stack.count(
            'country_methods',
            "country_code = 'CI' and method_id = 'mobile_money' and status = 'down'",
          ),
        ).toBe(1),
      SLOW,
    )
    expect(await stack.count('notifications', "kind = 'corridor'")).toBeGreaterThan(told)
    expect(await stack.count('audit_log', "action = 'corridor.changed'")).toBeGreaterThan(0)

    /* a buyer who opens the checkout afterwards */
    cleanup()
    resetClient()
    open('#/buyer/checkout/ai-for-work')
    await screen.findByText('Best match first', undefined, SLOW)
    expect(screen.queryByRole('radio', { name: /^Mobile money/ })).toBeNull()
    expect(screen.getAllByRole('radio').length).toBeGreaterThan(0)

    await stack.db.query("update public.country_methods set status = 'operational' where country_code = 'CI'")
  }, 60_000)
})

describe('the seller asks the copilot, and confirms a change', () => {
  const call = (name, args) => ({ callId: `call_${name}`, name, arguments: JSON.stringify(args) })
  const answer = (over) => ({
    text: '',
    parsed: null,
    refusal: null,
    calls: [],
    output: [],
    usage: { inputTokens: 500, outputTokens: 40 },
    status: 'completed',
    incomplete: null,
    model: 'agent-model',
    ...over,
  })

  it('reads real numbers, proposes turning on Kenya mobile money, and nothing happens until Confirm', async () => {
    const proposal = call('propose_method_change', { country: 'KE', method: 'mobile_money', enabled: true })
    const overview = call('get_overview', { days: 30 })
    stack.openai.respond
      .mockResolvedValueOnce(
        answer({
          calls: [overview],
          output: [
            { type: 'function_call', call_id: overview.callId, name: overview.name, arguments: overview.arguments },
          ],
        }),
      )
      .mockResolvedValueOnce(
        answer({ text: 'Sales are healthy. Turning on mobile money in Kenya is ready to confirm.' }),
      )
      .mockResolvedValueOnce(
        answer({
          calls: [proposal],
          output: [
            { type: 'function_call', call_id: proposal.callId, name: proposal.name, arguments: proposal.arguments },
          ],
        }),
      )
      .mockResolvedValueOnce(answer({ text: 'It is ready to confirm.' }))

    open('#/seller/copilot')
    const box = await screen.findByRole('textbox', { name: 'Ask the copilot' }, SLOW)
    fireEvent.change(box, { target: { value: 'How are sales?' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(
      await screen.findByText(
        'Sales are healthy. Turning on mobile money in Kenya is ready to confirm.',
        undefined,
        SLOW,
      ),
    ).toBeTruthy()
    expect(screen.getByLabelText('What the copilot looked at').textContent).toBe('Read your overview')

    /* what the model was shown is the real overview of the real database */
    const secondCall = stack.openai.respond.mock.calls[1][0]
    const output = JSON.parse(secondCall.input.find((item) => item.type === 'function_call_output').output)
    expect(output.volume_usd.now).toBeGreaterThan(1000)

    fireEvent.change(box, { target: { value: 'Turn on mobile money in Kenya' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(await screen.findByText('Turn on Mobile money in Kenya', undefined, SLOW)).toBeTruthy()
    const before = await stack.one(
      "select enabled from public.merchant_methods where country_code = 'KE' and method_id = 'mobile_money' and merchant_id = (select id from public.merchants where slug = 'pdl')",
    )
    expect(before.enabled).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(await screen.findByText('Done', undefined, SLOW)).toBeTruthy()
    const after = await stack.one(
      "select enabled from public.merchant_methods where country_code = 'KE' and method_id = 'mobile_money' and merchant_id = (select id from public.merchants where slug = 'pdl')",
    )
    expect(after.enabled).toBe(true)
    expect(await stack.count('audit_log', "action = 'method.enabled' and data->>'via' = 'copilot'")).toBe(1)

    /* the Countries page shows it on */
    go('#/seller/countries')
    const kenya = await screen.findByRole('region', { name: 'Kenya' }, SLOW)
    await waitFor(
      () => expect(within(kenya).getByRole('switch', { name: 'Mobile money in Kenya' }).checked).toBe(true),
      SLOW,
    )

    await stack.db.query(
      "update public.merchant_methods set enabled = false where country_code = 'KE' and method_id = 'mobile_money'",
    )
  }, 90_000)
})

describe('the demo director runs a scenario, and resets', () => {
  it('runs the card testing attack through the real pipeline, shows it to the admin, then resets', async () => {
    open('#/buyer/home')
    fireEvent.click(await screen.findByRole('button', { name: 'Demo' }, SLOW))
    const dialog = await screen.findByRole('dialog', { name: 'About this demo' })
    await within(dialog).findByText('Run a scenario', undefined, SLOW)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Run Card testing attack' }))

    const result = await within(dialog).findByRole(
      'status',
      { name: 'Result: Card testing attack' },
      { timeout: 30_000 },
    )
    expect(within(result).getByText('A bot made 4 attempts. The last one was blocked at once.')).toBeTruthy()
    const buyer = await stack.one(
      "select buyer_id from public.payments where status = 'blocked' and origin = 'app' order by created_at desc limit 1",
    )
    const attempts = await stack.db.query(
      'select status from public.payments where buyer_id = $1 order by created_at, id',
      [buyer.buyer_id],
    )
    expect(attempts.map((row) => row.status)).toEqual(['in_review', 'in_review', 'in_review', 'blocked'])

    /* the admin overview shows what the scenario did */
    fireEvent.click(within(result).getByRole('button', { name: 'Admin: Overview' }))
    expect(window.location.hash).toBe('#/admin/overview')
    const blocked = await screen.findAllByText('Blocked payments', { selector: 'h3' }, SLOW)
    await waitFor(() => expect(within(blocked[0].closest('article')).getByText(/kept out/)).toBeTruthy(), SLOW)

    /* and a reset leaves the demo as new */
    fireEvent.click(screen.getByRole('button', { name: 'Demo' }))
    const again = await screen.findByRole('dialog', { name: 'About this demo' })
    fireEvent.click(await within(again).findByRole('button', { name: 'Reset the demo' }, SLOW))
    const sure = await screen.findByRole('dialog', { name: 'Reset the demo?' })
    fireEvent.click(within(sure).getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(reloadApp).toHaveBeenCalled(), { timeout: 30_000 })
    expect(await stack.count('payments', "origin = 'app'")).toBe(0)
    expect(await stack.count('payments', "status in ('in_review', 'blocked')")).toBe(0)
    expect(await stack.count('risk_assessments')).toBe(await stack.count('payments'))
  }, 120_000)
})
