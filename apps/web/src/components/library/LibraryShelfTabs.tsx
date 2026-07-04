// Shelf switcher (Books vs Read later). Extracted verbatim from LibraryPage.tsx
// (R6 slice-1) — presentational; parent owns the `shelf` state.

type Shelf = 'books' | 'readlater'

export function LibraryShelfTabs({
  shelf,
  onSelect,
  t,
}: {
  shelf: Shelf
  onSelect: (shelf: Shelf) => void
  t: (key: string) => string
}) {
  return (
    <div className="library-shelf-tabs" role="tablist" aria-label={t('library.title')}>
      <button
        type="button"
        role="tab"
        aria-selected={shelf === 'books'}
        className={`library-shelf-tab${shelf === 'books' ? ' library-shelf-tab--active' : ''}`}
        onClick={() => onSelect('books')}
      >
        {t('library.readLater.tabBooks')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={shelf === 'readlater'}
        className={`library-shelf-tab${shelf === 'readlater' ? ' library-shelf-tab--active' : ''}`}
        onClick={() => onSelect('readlater')}
      >
        {t('library.readLater.tab')}
      </button>
    </div>
  )
}
