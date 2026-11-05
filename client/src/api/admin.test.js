// @vitest-environment jsdom
/* The admin, copilot and Method Match calls: the address and the body of each, and that empty filters are left out. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as admin from './admin.js'
import { getMethodMatch } from './checkout.js'
import * as copilot from './copilot.js'

const answer = (data) => ({ ok: true, status: 200, json: async () => ({ data }) })

afterEach(() => vi.unstubAllGlobals())

const stub = (data = {}) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => answer(data)),
  )
  return () => ({ url: fetch.mock.calls[0][0], init: fetch.mock.calls[0][1] })
}

describe('admin api', () => {
  it('reads the overview for a period', async () => {
    const sent = stub({ ok: true })
    await admin.getOverview({ days: 7 })
    expect(sent().url).toBe('/api/admin/overview?days=7')
    expect(sent().init.method).toBe('GET')
  })

  it('leaves empty filters out of the transactions address', async () => {
    const sent = stub({})
    await admin.getTransactions({ status: '', merchant: 'pdl', level: 'high', from: undefined, limit: 1000 })
    expect(sent().url).toBe('/api/admin/transactions?merchant=pdl&level=high&limit=1000')
  })

  it('opens one transaction', async () => {
    const sent = stub({})
    await admin.getTransaction('pay-1')
    expect(sent().url).toBe('/api/admin/transactions/pay-1')
  })

  it('approves and rejects with a note, and without one', async () => {
    let sent = stub({})
    await admin.approvePayment('pay-1', 'Fine')
    expect(sent().url).toBe('/api/admin/review/pay-1/approve')
    expect(sent().init.method).toBe('POST')
    expect(JSON.parse(sent().init.body)).toEqual({ note: 'Fine' })

    sent = stub({})
    await admin.rejectPayment('pay-2')
    expect(sent().url).toBe('/api/admin/review/pay-2/reject')
    expect(sent().init.body).toBe('{}')
  })

  it('changes a corridor with a patch', async () => {
    const sent = stub({})
    await admin.setCorridor('KE', 'mobile_money', { status: 'down' })
    expect(sent().url).toBe('/api/admin/corridors/KE/methods/mobile_money')
    expect(sent().init.method).toBe('PATCH')
    expect(JSON.parse(sent().init.body)).toEqual({ status: 'down' })
  })

  it('pays out a seller by name', async () => {
    const sent = stub({})
    await admin.runSettlement('pdl')
    expect(sent().url).toBe('/api/admin/settlements/run')
    expect(JSON.parse(sent().init.body)).toEqual({ merchant: 'pdl' })
  })

  it('runs the fairness trial on the latest flagged payment unless one is named', async () => {
    let sent = stub({})
    await admin.probeFairness()
    expect(sent().url).toBe('/api/admin/fairness/probe')
    expect(sent().init.body).toBe('{}')

    sent = stub({})
    await admin.probeFairness('pay-3')
    expect(JSON.parse(sent().init.body)).toEqual({ payment: 'pay-3' })
  })

  it('reads the other pages', async () => {
    const calls = [
      [() => admin.getReview(), '/api/admin/review'],
      [() => admin.getMerchants({ days: 90 }), '/api/admin/merchants?days=90'],
      [() => admin.getCorridors({ days: 30 }), '/api/admin/corridors?days=30'],
      [() => admin.getSettlements(), '/api/admin/settlements'],
      [() => admin.getFairness({ days: 30 }), '/api/admin/fairness?days=30'],
      [() => admin.getAudit({ actor: 'ai', limit: 500 }), '/api/admin/audit?actor=ai&limit=500'],
    ]
    for (const [call, url] of calls) {
      const sent = stub({})
      await call()
      expect(sent().url).toBe(url)
    }
  })
})

describe('copilot api', () => {
  it('reads the status', async () => {
    const sent = stub({ enabled: true })
    await copilot.getCopilotStatus()
    expect(sent().url).toBe('/api/copilot/status')
  })

  it('asks with the conversation, and no seller of its own choosing', async () => {
    const sent = stub({ reply: 'Hi' })
    await copilot.askCopilot([{ role: 'user', content: 'Hello' }])
    expect(sent().url).toBe('/api/copilot/ask')
    expect(sent().init.method).toBe('POST')
    expect(JSON.parse(sent().init.body)).toEqual({ messages: [{ role: 'user', content: 'Hello' }] })
  })

  it('confirms and dismisses a proposed change by its id', async () => {
    let sent = stub({})
    await copilot.confirmAction('act-1')
    expect(sent().url).toBe('/api/copilot/actions/act-1/confirm')
    expect(sent().init.method).toBe('POST')

    sent = stub({})
    await copilot.dismissAction('act-2')
    expect(sent().url).toBe('/api/copilot/actions/act-2/dismiss')
  })
})

describe('Method Match api', () => {
  it('asks for one country, for the demo seller', async () => {
    const sent = stub({ methods: [] })
    await getMethodMatch('CI')
    expect(sent().url).toBe('/api/checkout/match?merchant=pdl&country=CI')
    expect(sent().init.method).toBe('GET')
  })
})
