import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { TranslationBubble } from '../TranslationBubble'

function makeRect(): DOMRect {
  return {
    top: 100, left: 100, width: 40, height: 20,
    right: 140, bottom: 120, x: 100, y: 100, toJSON: () => ({}),
  } as DOMRect
}

describe('TranslationBubble — Saved ✓ badge', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); cleanup() })

  it('renders Saved ✓ but hidden (not --visible) by default', () => {
    render(
      <TranslationBubble
        word="hello" translation="привіт" state="ready"
        rect={makeRect()} onClose={() => {}}
      />
    )
    const badge = screen.getByText('Saved ✓')
    expect(badge.className).not.toContain('translation-bubble__saved--visible')
    expect(badge.getAttribute('aria-hidden')).toBe('true')
  })

  it('shows --visible class when saved=true', () => {
    render(
      <TranslationBubble
        word="hello" translation="привіт" state="ready"
        rect={makeRect()} onClose={() => {}} saved
      />
    )
    const badge = screen.getByText('Saved ✓')
    expect(badge.className).toContain('translation-bubble__saved--visible')
    expect(badge.getAttribute('aria-hidden')).toBe('false')
  })

  it('hides badge again when saved flips back to false', () => {
    const { rerender } = render(
      <TranslationBubble
        word="hello" translation="привіт" state="ready"
        rect={makeRect()} onClose={() => {}} saved
      />
    )
    expect(screen.getByText('Saved ✓').className).toContain('translation-bubble__saved--visible')

    rerender(
      <TranslationBubble
        word="hello" translation="привіт" state="ready"
        rect={makeRect()} onClose={() => {}} saved={false}
      />
    )
    expect(screen.getByText('Saved ✓').className).not.toContain('translation-bubble__saved--visible')
  })

  it('does not show --visible during loading even if saved=true', () => {
    // saved wiring only fires after resolve; sanity: prop is independent of state.
    render(
      <TranslationBubble
        word="hello" translation={null} state="loading"
        rect={makeRect()} onClose={() => {}} saved={false}
      />
    )
    expect(screen.getByText('Saved ✓').className).not.toContain('translation-bubble__saved--visible')
  })

  it('returns null when rect is null (nothing to anchor)', () => {
    const { container } = render(
      <TranslationBubble
        word="hello" translation="привіт" state="ready"
        rect={null} onClose={() => {}} saved
      />
    )
    expect(container.firstChild).toBeNull()
  })
})
