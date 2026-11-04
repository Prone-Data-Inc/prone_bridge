import { describe, expect, it } from 'vitest'
import { EnvError, loadEnv } from './env.js'

describe('loadEnv', () => {
  it('works with nothing set and reports every integration as off', () => {
    const env = loadEnv({})
    expect(env.nodeEnv).toBe('development')
    expect(env.host).toBe('127.0.0.1')
    expect(env.port).toBe(8000)
    expect(env.serveClient).toBe(false)
    expect(env.integrations).toEqual({ database: false, paypal: false, ai: false })
    expect(env.paypal.env).toBe('sandbox')
    expect(env.ai.models).toEqual({ agent: 'gpt-6.1-sol', fast: 'gpt-6-luna' })
  })

  it('treats blank values from a .env file as not set', () => {
    const env = loadEnv({ PORT: '', PAYPAL_ENV: '', DATABASE_URL: '' })
    expect(env.port).toBe(8000)
    expect(env.paypal.env).toBe('sandbox')
  })

  it('turns an integration on only when all of its keys exist', () => {
    expect(loadEnv({ PAYPAL_CLIENT_ID: 'id' }).integrations.paypal).toBe(false)
    expect(loadEnv({ PAYPAL_CLIENT_ID: 'id', PAYPAL_CLIENT_SECRET: 'secret' }).integrations.paypal).toBe(true)
    expect(loadEnv({ DATABASE_URL: 'postgresql://u:p@db.example.com:5432/postgres' }).integrations.database).toBe(true)
    expect(loadEnv({ OPENAI_API_KEY: 'key' }).integrations.ai).toBe(true)
  })

  it('reads the database settings, and keeps one connection on Vercel', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgresql://u:p@db.example.com:5432/postgres',
      DATABASE_SSL_CA_FILE: 'certs/ca.crt',
      DATABASE_POOL_MAX: '3',
      VERCEL: '1',
    })
    expect(env.database).toEqual({
      url: 'postgresql://u:p@db.example.com:5432/postgres',
      sslCa: '',
      sslCaFile: 'certs/ca.crt',
      poolMax: 3,
    })
    expect(env.isServerless).toBe(true)
    expect(loadEnv({}).isServerless).toBe(false)
  })

  it('reads the port and the serve flag', () => {
    const env = loadEnv({ PORT: '9001', SERVE_CLIENT: 'true', NODE_ENV: 'production' })
    expect(env.port).toBe(9001)
    expect(env.serveClient).toBe(true)
    expect(env.isProduction).toBe(true)
  })

  it('refuses live PayPal, this project is sandbox only', () => {
    expect(() => loadEnv({ PAYPAL_ENV: 'live' })).toThrow(EnvError)
    expect(() => loadEnv({ PAYPAL_ENV: 'live' })).toThrow(/PAYPAL_ENV/)
  })

  it('names every invalid value', () => {
    try {
      loadEnv({ PORT: 'abc', APP_URL: 'not a url' })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError)
      expect(error.message).toMatch(/PORT/)
      expect(error.message).toMatch(/APP_URL/)
    }
  })

  it('returns a frozen config', () => {
    const env = loadEnv({})
    expect(Object.isFrozen(env)).toBe(true)
    expect(Object.isFrozen(env.paypal)).toBe(true)
  })
})
