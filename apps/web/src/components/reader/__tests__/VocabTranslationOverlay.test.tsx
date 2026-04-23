import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { WordMatch } from '../../../lib/vocabHighlightEngine'
import { VocabTranslationOverlay } from '../VocabTranslationOverlay'

// JSDOM always returns zero-size rects — stub getBoundingClientRect so the
// placement code has something meaningful to position.
function stubRect(range: Range, rect: Partial<DOMRect>) {
  const merged: DOMRect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect
  range.getBoundingClientRect = () => merged
}

function mkMatch(key: string, translation: string | null, rect: Partial<DOMRect>): WordMatch {
  const el = document.createElement('span')
  el.textContent = key
  document.body.appendChild(el)
  const range = document.createRange()
  range.selectNodeContents(el)
  stubRect(range, rect)
  return { key, word: key, stage: 0, translation, range, isActive: false }
}

describe('VocabTranslationOverlay', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when visible=false', () => {
    const m = mkMatch('fox', 'лиса', { left: 10, top: 20, width: 30, height: 10 })
    const { container } = render(<VocabTranslationOverlay matches={[m]} visible={false} />)
    expect(container.querySelector('.vocab-translation-overlay')).toBeNull()
  })

  it('renders nothing when matches list is empty', () => {
    const { container } = render(<VocabTranslationOverlay matches={[]} visible={true} />)
    expect(container.querySelector('.vocab-translation-overlay')).toBeNull()
  })

  it('renders one item per match with translation', () => {
    const a = mkMatch('fox', 'лиса', { left: 100, top: 50, width: 20, height: 10 })
    const b = mkMatch('cat', 'кіт', { left: 200, top: 80, width: 20, height: 10 })
    render(<VocabTranslationOverlay matches={[a, b]} visible={true} />)
    expect(screen.getByText('лиса')).toBeInTheDocument()
    expect(screen.getByText('кіт')).toBeInTheDocument()
  })

  it('skips matches without translation', () => {
    const withTr = mkMatch('fox', 'лиса', { left: 10, top: 10, width: 20, height: 10 })
    const noTr = mkMatch('cat', null, { left: 30, top: 10, width: 20, height: 10 })
    render(<VocabTranslationOverlay matches={[withTr, noTr]} visible={true} />)
    expect(document.body.querySelectorAll('.vocab-translation-overlay__item').length).toBe(1)
  })

  it('skips matches with zero-size rects (not yet laid out)', () => {
    const zero = mkMatch('fox', 'лиса', { left: 0, top: 0, width: 0, height: 0 })
    render(<VocabTranslationOverlay matches={[zero]} visible={true} />)
    expect(document.body.querySelector('.vocab-translation-overlay')).toBeNull()
  })

  it('tags the overlay with data-vocab-overlay so the engine skips it', () => {
    const m = mkMatch('x', 'y', { left: 1, top: 1, width: 10, height: 10 })
    render(<VocabTranslationOverlay matches={[m]} visible={true} />)
    const overlay = document.body.querySelector('.vocab-translation-overlay')
    expect(overlay?.getAttribute('data-vocab-overlay')).toBe('true')
  })

  it('places items using document coords via CSS custom props', () => {
    const m = mkMatch('fox', 'лиса', { left: 100, top: 50, width: 20, height: 10 })
    render(<VocabTranslationOverlay matches={[m]} visible={true} />)
    const item = document.body.querySelector('.vocab-translation-overlay__item') as HTMLElement
    // x = left + width/2 + scrollX = 110, y = top + scrollY = 50
    expect(item.style.getPropertyValue('--x')).toBe('110px')
    expect(item.style.getPropertyValue('--y')).toBe('50px')
  })

  it('recomputes placements on resize (debounced)', async () => {
    const m = mkMatch('fox', 'лиса', { left: 100, top: 50, width: 20, height: 10 })
    render(<VocabTranslationOverlay matches={[m]} visible={true} reflowDebounceMs={10} />)
    let item = document.body.querySelector('.vocab-translation-overlay__item') as HTMLElement
    expect(item.style.getPropertyValue('--x')).toBe('110px')

    // Resize: word reflows up by 40px.
    stubRect(m.range, { left: 100, top: 10, width: 20, height: 10 })
    window.dispatchEvent(new Event('resize'))

    await waitFor(() => {
      item = document.body.querySelector('.vocab-translation-overlay__item') as HTMLElement
      expect(item.style.getPropertyValue('--y')).toBe('10px')
    })
  })
})
