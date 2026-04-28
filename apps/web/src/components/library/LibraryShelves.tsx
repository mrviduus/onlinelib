import { useTranslation } from '../../hooks/useTranslation'
import { useLibraryShelves } from '../../hooks/useLibraryShelves'
import { LibraryShelf } from './LibraryShelf'
import { LibraryEmptyState } from './LibraryEmptyState'

interface LibraryShelvesProps {
  hasAnyContent: boolean
}

export function LibraryShelves({ hasAnyContent }: LibraryShelvesProps) {
  const { t } = useTranslation()
  const { shelves, loading, error } = useLibraryShelves()

  if (loading && !shelves) return null
  if (error) return null
  if (!shelves) return null

  const allEmpty =
    shelves.continueReading.length === 0 &&
    shelves.recentlyAdded.length === 0 &&
    shelves.quickReads.length === 0 &&
    shelves.finishedThisMonth.length === 0

  if (allEmpty && !hasAnyContent) return <LibraryEmptyState />

  if (allEmpty) return null

  return (
    <div className="library-shelves">
      <LibraryShelf
        shelfId="continueReading"
        title={t('library.shelves.continueReading.title')}
        subtitle={t('library.shelves.continueReading.subtitle')}
        items={shelves.continueReading}
        viewAllHref="/library?filter=reading"
      />
      <LibraryShelf
        shelfId="recentlyAdded"
        title={t('library.shelves.recentlyAdded.title')}
        subtitle={t('library.shelves.recentlyAdded.subtitle')}
        items={shelves.recentlyAdded}
        viewAllHref="/library?sort=created_desc"
      />
      <LibraryShelf
        shelfId="quickReads"
        title={t('library.shelves.quickReads.title')}
        subtitle={t('library.shelves.quickReads.subtitle')}
        items={shelves.quickReads}
      />
      <LibraryShelf
        shelfId="finishedThisMonth"
        title={t('library.shelves.finishedThisMonth.title')}
        subtitle={t('library.shelves.finishedThisMonth.subtitle')}
        items={shelves.finishedThisMonth}
        viewAllHref="/library?filter=finished"
      />
    </div>
  )
}
