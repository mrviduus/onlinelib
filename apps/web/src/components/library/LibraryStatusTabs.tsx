import { useTranslation } from '../../hooks/useTranslation'
import type { LibraryStatus } from '../../hooks/useLibraryStatus'

const PRIMARY: LibraryStatus[] = ['reading', 'finished', 'notStarted']

interface Props {
  value: LibraryStatus
  onChange: (next: LibraryStatus) => void
  counts: Record<LibraryStatus, number>
}

export function LibraryStatusTabs({ value, onChange, counts }: Props) {
  const { t } = useTranslation()
  const showFailed = counts.failed > 0

  const renderTab = (key: LibraryStatus, variant: 'primary' | 'secondary' = 'primary') => {
    const active = value === key
    return (
      <button
        key={key}
        type="button"
        role="tab"
        aria-selected={active}
        className={`library-status-tabs__tab library-status-tabs__tab--${variant} ${active ? 'library-status-tabs__tab--active' : ''}`}
        onClick={() => onChange(key)}
      >
        <span className="library-status-tabs__label">{t(`library.status.${key}`)}</span>
        <span className="library-status-tabs__count">{counts[key]}</span>
      </button>
    )
  }

  return (
    <div className="library-status-tabs" role="tablist" aria-label={t('library.status.ariaLabel')}>
      <div className="library-status-tabs__primary">
        {PRIMARY.map((k) => renderTab(k, 'primary'))}
        {showFailed && renderTab('failed', 'primary')}
      </div>
      <div className="library-status-tabs__secondary">
        {renderTab('all', 'secondary')}
      </div>
    </div>
  )
}
