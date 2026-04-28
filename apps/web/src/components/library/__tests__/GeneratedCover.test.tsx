import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

import { GeneratedCover } from '../GeneratedCover'

afterEach(() => cleanup())

describe('GeneratedCover', () => {
  it('renders the first letter of title uppercased', () => {
    render(<GeneratedCover title="dune" />)
    expect(screen.getByText('D')).toBeInTheDocument()
  })

  it('falls back to ? for empty title', () => {
    render(<GeneratedCover title="" />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('produces stable gradient for same title+author', () => {
    const { container, unmount } = render(<GeneratedCover title="Dracula" author="Bram Stoker" />)
    const first = container.querySelector('.generated-cover')!.getAttribute('style')
    unmount()
    const { container: c2 } = render(<GeneratedCover title="Dracula" author="Bram Stoker" />)
    const second = c2.querySelector('.generated-cover')!.getAttribute('style')
    expect(first).toBe(second)
  })

  it('produces different gradient for different titles', () => {
    const { container, unmount } = render(<GeneratedCover title="Dracula" />)
    const a = container.querySelector('.generated-cover')!.getAttribute('style')
    unmount()
    const { container: c2 } = render(<GeneratedCover title="Frankenstein" />)
    const b = c2.querySelector('.generated-cover')!.getAttribute('style')
    expect(a).not.toBe(b)
  })

  it('honors className prop', () => {
    const { container } = render(<GeneratedCover title="X" className="hidden" />)
    expect(container.querySelector('.generated-cover.hidden')).toBeTruthy()
  })
})
