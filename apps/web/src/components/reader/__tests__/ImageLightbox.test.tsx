import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ImageLightbox } from '../ImageLightbox'

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

describe('ImageLightbox', () => {
  it('renders image with given src and alt', () => {
    render(<ImageLightbox src="/x.png" alt="diagram" onClose={() => {}} />)
    const img = screen.getByAltText('diagram') as HTMLImageElement
    expect(img.src).toContain('/x.png')
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(<ImageLightbox src="/x.png" onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<ImageLightbox src="/x.png" onClose={onClose} />)
    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog, { target: dialog })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onClose when image itself is clicked', () => {
    const onClose = vi.fn()
    render(<ImageLightbox src="/x.png" alt="d" onClose={onClose} />)
    fireEvent.click(screen.getByAltText('d'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('zooms via + key and shows percentage label', () => {
    render(<ImageLightbox src="/x.png" onClose={() => {}} />)
    const reset = screen.getByRole('button', { name: /reset zoom/i })
    expect(reset.textContent).toBe('100%')
    fireEvent.keyDown(document, { key: '+' })
    expect(reset.textContent).toBe('125%')
  })

  it('reset returns to 100%', () => {
    render(<ImageLightbox src="/x.png" onClose={() => {}} />)
    fireEvent.keyDown(document, { key: '+' })
    fireEvent.keyDown(document, { key: '+' })
    fireEvent.keyDown(document, { key: '0' })
    expect(screen.getByRole('button', { name: /reset zoom/i }).textContent).toBe('100%')
  })

  it('locks body scroll while open and restores on unmount', () => {
    document.body.style.overflow = 'auto'
    const { unmount } = render(<ImageLightbox src="/x.png" onClose={() => {}} />)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('auto')
  })

  it('zoom-out is disabled at 100%', () => {
    render(<ImageLightbox src="/x.png" onClose={() => {}} />)
    const out = screen.getByRole('button', { name: /zoom out/i }) as HTMLButtonElement
    expect(out.disabled).toBe(true)
    fireEvent.keyDown(document, { key: '+' })
    expect(out.disabled).toBe(false)
  })
})
