import { describe, expect, it } from 'vitest'
import { inline, parseRich } from './richText.js'

describe('inline', () => {
  it('finds bold words and leaves the rest alone', () => {
    expect(inline('Sales are **up 12%** on last week')).toEqual([
      { text: 'Sales are ' },
      { text: 'up 12%', bold: true },
      { text: ' on last week' },
    ])
  })

  it('handles several bold words, and none', () => {
    expect(inline('**a** and **b**')).toEqual([{ text: 'a', bold: true }, { text: ' and ' }, { text: 'b', bold: true }])
    expect(inline('plain')).toEqual([{ text: 'plain' }])
    expect(inline('')).toEqual([])
  })

  it('leaves unmatched stars as they are', () => {
    expect(inline('**never closed')).toEqual([{ text: '**never closed' }])
    expect(inline('3 * 4 = 12')).toEqual([{ text: '3 * 4 = 12' }])
  })
})

describe('parseRich', () => {
  it('makes a paragraph of each run of lines, split by blank lines', () => {
    expect(parseRich('First line\nstill first\n\nSecond')).toEqual([
      { type: 'p', parts: [{ text: 'First line' }, { text: ' ' }, { text: 'still first' }] },
      { type: 'p', parts: [{ text: 'Second' }] },
    ])
  })

  it('makes a list of lines that start with a hyphen or a star', () => {
    expect(parseRich('Top countries:\n- Ghana\n- **Kenya**\n* Nigeria')).toEqual([
      { type: 'p', parts: [{ text: 'Top countries:' }] },
      { type: 'ul', items: [[{ text: 'Ghana' }], [{ text: 'Kenya', bold: true }], [{ text: 'Nigeria' }]] },
    ])
  })

  it('starts a new list after a paragraph, and a new paragraph after a list', () => {
    const blocks = parseRich('- a\ntext\n- b')
    expect(blocks.map((block) => block.type)).toEqual(['ul', 'p', 'ul'])
  })

  it('ignores empty input and extra blank lines', () => {
    expect(parseRich('')).toEqual([])
    expect(parseRich('\n\n  \n')).toEqual([])
    expect(parseRich(undefined)).toEqual([{ type: 'p', parts: [{ text: 'undefined' }] }])
  })

  it('never turns markup into anything but text', () => {
    const [block] = parseRich('<img src=x onerror=alert(1)> **<b>bold</b>**')
    expect(block.parts.map((part) => part.text).join('')).toBe('<img src=x onerror=alert(1)> <b>bold</b>')
    expect(JSON.stringify(block)).not.toContain('"html"')
  })
})
