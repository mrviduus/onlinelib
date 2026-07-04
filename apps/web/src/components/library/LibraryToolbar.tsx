// Library grid toolbar: sort menu + (uploads) select toggle + list/grid view
// switch. Extracted verbatim from LibraryPage.tsx (R6 slice-1) — presentational;
// parent owns sort / selection / viewMode state.
import { LibrarySortMenu } from './LibrarySortMenu'
import type { LibrarySortKey } from '../../hooks/useLibrarySort'

type ViewMode = 'list' | 'grid'

export function LibraryToolbar({
  sort,
  onSortChange,
  showSelectButton,
  selectionActive,
  onToggleSelection,
  viewMode,
  onViewModeChange,
  t,
}: {
  sort: LibrarySortKey
  onSortChange: (next: LibrarySortKey) => void
  showSelectButton: boolean
  selectionActive: boolean
  onToggleSelection: () => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  t: (key: string) => string
}) {
  return (
    <div className="library-toolbar">
      <div className="library-toolbar__left">
        <LibrarySortMenu value={sort} onChange={onSortChange} />
        {showSelectButton && (
          <button
            type="button"
            className={`library-select-btn ${selectionActive ? 'library-select-btn--active' : ''}`}
            onClick={onToggleSelection}
          >
            {selectionActive ? t('library.bulk.cancel') : t('library.bulk.select')}
          </button>
        )}
      </div>
      <div className="library-toolbar__right">
        <button
          className={`library-view-btn ${viewMode === 'grid' ? 'library-view-btn--active' : ''}`}
          onClick={() => onViewModeChange('grid')}
          aria-label="Grid view"
        >
          <span className="material-icons-outlined">grid_view</span>
        </button>
        <button
          className={`library-view-btn ${viewMode === 'list' ? 'library-view-btn--active' : ''}`}
          onClick={() => onViewModeChange('list')}
          aria-label="List view"
        >
          <span className="material-icons-outlined">format_list_bulleted</span>
        </button>
      </div>
    </div>
  )
}
