import { useTranslation } from '../../hooks/useTranslation'
import { LocalizedLink } from '../LocalizedLink'
import { UploadButton } from './UploadButton'

export function LibraryEmptyState() {
  const { t } = useTranslation()
  return (
    <div className="library-empty-state">
      <div className="library-empty-state__icon">📚</div>
      <h2 className="library-empty-state__title">{t('library.shelves.empty.title')}</h2>
      <p className="library-empty-state__copy">{t('library.shelves.empty.copy')}</p>
      <div className="library-empty-state__actions">
        <UploadButton />
        <LocalizedLink to="/books" className="library-empty-state__catalog-link">
          {t('library.shelves.empty.browseCatalog')} →
        </LocalizedLink>
      </div>
    </div>
  )
}
