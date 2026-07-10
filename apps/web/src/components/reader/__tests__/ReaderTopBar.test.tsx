import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ReaderTopBar } from '../ReaderTopBar'

function renderBar(extra?: Partial<React.ComponentProps<typeof ReaderTopBar>>) {
  return render(
    <MemoryRouter>
      <ReaderTopBar
        visible
        title="Book"
        chapterTitle="Chapter 1"
        progress={0.5}
        isBookmarked={false}
        backUrl="/back"
        onSearchClick={() => {}}
        onTocClick={() => {}}
        onSettingsClick={() => {}}
        onBookmarkClick={() => {}}
        {...extra}
      />
    </MemoryRouter>,
  )
}

describe('ReaderTopBar — Original-layout toggle removed (ADR-012)', () => {
  it('renders exactly the 4 positional buttons (search, bookmark, toc, settings) with no toggle', () => {
    const { container } = renderBar()
    const btns = container.querySelectorAll('.reader-top-bar__btn')
    expect(btns.length).toBe(4)
    // No toggle button remains — none should be aria-pressed (toggle used it).
    expect(container.querySelector('[aria-pressed]')).toBeNull()
  })

  it('Ask is appended last (index 4) without shifting the base 4', () => {
    const { container } = renderBar({ showAsk: true, onAskClick: () => {} })
    const btns = container.querySelectorAll('.reader-top-bar__btn')
    expect(btns.length).toBe(5)
    expect(btns[4].getAttribute('title')).toBe('Ask this book')
  })
})
