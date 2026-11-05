// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText, linkUrl } from './links.js'

afterEach(() => {
  vi.unstubAllGlobals()
  delete document.execCommand
})

describe('linkUrl', () => {
  it("is this app, opened on the buyer's link page", () => {
    expect(linkUrl('9n2pdmb6')).toBe(`${window.location.origin}${window.location.pathname}#/buyer/link/9n2pdmb6`)
    expect(linkUrl('9n2pdmb6')).toMatch(/#\/buyer\/link\/9n2pdmb6$/)
  })
})

describe('copyText', () => {
  it('uses the clipboard when there is one', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    expect(await copyText('hello')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('falls back to selecting a hidden field when the clipboard is not available', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) } })
    document.execCommand = vi.fn(() => true)
    expect(await copyText('hello')).toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('says so when nothing works, and leaves nothing behind', async () => {
    vi.stubGlobal('navigator', {})
    document.execCommand = vi.fn(() => {
      throw new Error('no')
    })
    expect(await copyText('hello')).toBe(false)
    expect(document.querySelector('textarea')).toBeNull()
  })
})
