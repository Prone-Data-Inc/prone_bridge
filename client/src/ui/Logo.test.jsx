// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { horizontalLockup } from '#shared/brand/logo.js'
import Logo from './Logo.jsx'

afterEach(cleanup)

describe('Logo', () => {
  it('is an image named Prone Bridge with a mark and a name', () => {
    render(<Logo />)
    const logo = screen.getByRole('img', { name: 'Prone Bridge' })
    expect(logo.querySelectorAll('path')).toHaveLength(2)
  })

  it('keeps the proportions of the lockup at any height', () => {
    render(<Logo height={50} />)
    const logo = screen.getByRole('img', { name: 'Prone Bridge' })
    const [width, height] = [Number(logo.getAttribute('width')), Number(logo.getAttribute('height'))]
    const lockup = horizontalLockup()
    expect(height).toBe(50)
    expect(width / height).toBeCloseTo(lockup.width / lockup.height, 3)
  })
})
