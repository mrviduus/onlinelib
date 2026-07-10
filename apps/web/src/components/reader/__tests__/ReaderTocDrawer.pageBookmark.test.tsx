import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ReaderTocDrawer } from '../ReaderTocDrawer'
import type { Bookmark } from '../../../hooks/useBookmarks'

const pageBookmark: Bookmark = {
  id: 'bm-page',
  bookId: 'b1',
  chapterSlug: '',
  chapterTitle: 'Page 42',
  page: 42,
  createdAt: Date.now(),
}

function renderDrawer(extra?: Partial<React.ComponentProps<typeof ReaderTocDrawer>>) {
  return render(
    <MemoryRouter>
      <ReaderTocDrawer
        open
        chapters={[]}
        currentChapterIdentifier=""
        bookmarks={[pageBookmark]}
        getChapterUrl={(id) => `/read/${id}`}
        useLocalizedLink={false}
        onClose={() => {}}
        onRemoveBookmark={() => {}}
        {...extra}
      />
    </MemoryRouter>,
  )
}

describe('ReaderTocDrawer — Original-layout page bookmarks', () => {
  it('renders a page bookmark with a "Page N" label', () => {
    renderDrawer()
    fireEvent.click(screen.getByText(/Bookmarks/))
    expect(screen.getByText('Page 42')).toBeTruthy()
  })

  it('clicking a page bookmark fires onBookmarkSelect (page jump) instead of navigating', () => {
    const onBookmarkSelect = vi.fn()
    renderDrawer({ onBookmarkSelect })
    fireEvent.click(screen.getByText(/Bookmarks/))
    fireEvent.click(screen.getByText('Page 42'))
    expect(onBookmarkSelect).toHaveBeenCalledTimes(1)
    expect(onBookmarkSelect.mock.calls[0][0].page).toBe(42)
  })
})
