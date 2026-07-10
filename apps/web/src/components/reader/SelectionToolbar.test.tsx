import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

// Avoid pulling in LanguageProvider — echo the key back as the label.
vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (k: string) => k, tArray: () => [], language: 'en' }),
}))

import { SelectionToolbar } from './SelectionToolbar'

const rect = {
  top: 100,
  left: 100,
  width: 40,
  height: 16,
  bottom: 116,
  right: 140,
} as DOMRect

function renderToolbar(hideHighlight: boolean) {
  const containerRef = { current: document.createElement('div') }
  return render(
    <SelectionToolbar
      rect={rect}
      text="hello world"
      containerRef={containerRef}
      hideHighlight={hideHighlight}
      onHighlight={vi.fn()}
      onTranslate={vi.fn()}
      onExplain={vi.fn()}
      onCopy={vi.fn()}
    />,
  )
}

describe('SelectionToolbar hideHighlight (Original-layout live-actions-only)', () => {
  it('shows highlight swatches in reflow mode', () => {
    const { container } = renderToolbar(false)
    expect(container.querySelectorAll('.selection-toolbar__color').length).toBe(4)
  })

  it('hides highlight swatches but keeps translate/explain/copy actions', () => {
    const { container, getByLabelText } = renderToolbar(true)
    expect(container.querySelectorAll('.selection-toolbar__color').length).toBe(0)
    expect(container.querySelector('.selection-toolbar__divider')).toBeNull()
    // Live actions survive.
    expect(getByLabelText('reader.selectionToolbar.translate')).toBeTruthy()
    expect(getByLabelText('reader.selectionToolbar.explain')).toBeTruthy()
    expect(getByLabelText('reader.selectionToolbar.copy')).toBeTruthy()
  })
})
