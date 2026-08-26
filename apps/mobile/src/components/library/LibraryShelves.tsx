import { View } from 'react-native'
import { useLanguage } from '../../context/LanguageContext'
import { useLibraryShelves } from '../../hooks/useLibraryShelves'
import { LibraryShelf } from './LibraryShelf'

export function LibraryShelves() {
  const { t } = useLanguage()
  const { shelves, loading, error } = useLibraryShelves()

  if (loading && !shelves) return null
  if (error || !shelves) return null

  // `continueReading` is intentionally absent: it is rendered above this
  // component as the resume hero + rail, which link into the reader at the
  // right chapter. This shelf could only ever open a detail page, so showing
  // both meant the same books twice on one screen, one copy of them worse.
  const allEmpty =
    shelves.recentlyAdded.length === 0 &&
    shelves.quickReads.length === 0 &&
    shelves.finishedThisMonth.length === 0

  if (allEmpty) return null

  return (
    <View>
      <LibraryShelf
        shelfId="recentlyAdded"
        title={t('library.shelves.recentlyAdded.title')}
        subtitle={t('library.shelves.recentlyAdded.subtitle')}
        items={shelves.recentlyAdded}
        viewAllHref="/library/shelf/recentlyAdded"
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
        viewAllHref="/library/shelf/finishedThisMonth"
      />
    </View>
  )
}
