import { describe, expect, it, vi } from 'vitest'
import { CHANNEL, connectRealtime } from './channel.js'

const anon = [
  Buffer.from('{"alg":"HS256"}').toString('base64url'),
  Buffer.from('{"role":"anon"}').toString('base64url'),
  'c2ln',
].join('.')
const secret = [
  Buffer.from('{"alg":"HS256"}').toString('base64url'),
  Buffer.from('{"role":"service_role"}').toString('base64url'),
  'c2ln',
].join('.')

function fakeClient() {
  const channel = { handlers: [], subscribeCallback: null }
  channel.on = vi.fn((type, filter, handler) => {
    channel.handlers.push({ type, filter, handler })
    return channel
  })
  channel.subscribe = vi.fn((callback) => {
    channel.subscribeCallback = callback
    return channel
  })
  const client = { channel: vi.fn(() => channel), removeChannel: vi.fn() }
  return { client, channel, make: vi.fn(() => client) }
}

describe('connectRealtime', () => {
  it('does nothing without keys, and says it is off', () => {
    const onStatus = vi.fn()
    const make = vi.fn()
    const connection = connectRealtime({ url: '', anonKey: '', onSignal: vi.fn(), onStatus, makeClient: make })
    expect(onStatus).toHaveBeenCalledWith('off')
    expect(make).not.toHaveBeenCalled()
    expect(() => connection.close()).not.toThrow()
  })

  it('refuses a secret key', () => {
    expect(() =>
      connectRealtime({ url: 'https://x.supabase.co', anonKey: secret, onSignal: vi.fn(), makeClient: vi.fn() }),
    ).toThrow(/anon key/)
  })

  it('listens to the public channel for change signals and passes them on', () => {
    const { channel, make, client } = fakeClient()
    const onSignal = vi.fn()
    connectRealtime({ url: 'https://x.supabase.co', anonKey: anon, onSignal, makeClient: make })

    expect(client.channel).toHaveBeenCalledWith(CHANNEL, { config: { broadcast: { self: false }, private: false } })
    expect(channel.handlers).toHaveLength(1)
    expect(channel.handlers[0]).toMatchObject({ type: 'broadcast', filter: { event: 'change' } })

    channel.handlers[0].handler({ payload: { table: 'payments', op: 'UPDATE', id: 'p1', status: 'succeeded' } })
    expect(onSignal).toHaveBeenCalledWith({ table: 'payments', op: 'UPDATE', id: 'p1', status: 'succeeded' })
  })

  it('reports the state of the connection', () => {
    const { channel, make } = fakeClient()
    const states = []
    connectRealtime({
      url: 'https://x.supabase.co',
      anonKey: anon,
      onSignal: vi.fn(),
      onStatus: (s) => states.push(s),
      makeClient: make,
    })
    for (const state of ['SUBSCRIBED', 'TIMED_OUT', 'CHANNEL_ERROR', 'CLOSED']) channel.subscribeCallback(state)
    expect(states).toEqual(['connecting', 'live', 'error', 'error', 'closed'])
  })

  it('leaves the channel when closed', () => {
    const { channel, make, client } = fakeClient()
    connectRealtime({ url: 'https://x.supabase.co', anonKey: anon, onSignal: vi.fn(), makeClient: make }).close()
    expect(client.removeChannel).toHaveBeenCalledWith(channel)
  })
})
