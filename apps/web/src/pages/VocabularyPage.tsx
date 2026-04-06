import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import { useVocabulary } from '../hooks/useVocabulary'
import { useTts } from '../hooks/useTts'
import { SeoHead } from '../components/SeoHead'
import { Footer } from '../components/Footer'
import { SpeakButton } from '../components/vocabulary/SpeakButton'
import { EmptyState } from '../components/EmptyState'

function StageBadge({ stage, t }: { stage: number; t: (k: string) => string }) {
  return (
    <span className={`vocab-stage-badge vocab-stage-badge--${stage}`}>
      {t(`vocabulary.stages.${stage}`)}
    </span>
  )
}

export function VocabularyPage({ embedded }: { embedded?: boolean } = {}) {
  const { isAuthenticated } = useAuth()
  const { t } = useTranslation()
  const { getLocalizedPath } = useLanguage()
  const navigate = useNavigate()
  const {
    words, total, loading, error, stats,
    filters, applyFilters, loadMore,
    removeWord, editWord,
  } = useVocabulary()
  const { speak, isPlaying } = useTts()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  if (!embedded && !isAuthenticated) {
    return (
      <div className="page-container">
        <SeoHead title={t('vocabulary.title')} noindex />
        <div className="vocab-page">
          <h1>{t('vocabulary.title')}</h1>
          <p>{t('vocabulary.signInPrompt')}</p>
        </div>
        <Footer />
      </div>
    )
  }

  if (loading && words.length === 0) {
    if (embedded) return <div className="vocab-loading">{t('common.loading')}</div>
    return (
      <div className="page-container">
        <SeoHead title={t('vocabulary.title')} noindex />
        <div className="vocab-page">
          <h1>{t('vocabulary.title')}</h1>
          <div className="vocab-loading">{t('common.loading')}</div>
        </div>
        <Footer />
      </div>
    )
  }

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    const stageMap: Record<string, string | undefined> = {
      all: undefined,
      new: '0',
      learning: '1,2,3',
      mastered: '4',
    }
    applyFilters({ stage: stageMap[tab] })
  }

  const handleSearch = (value: string) => {
    setSearch(value)
    applyFilters({ search: value || undefined })
  }

  const handleSort = (sort: string) => {
    applyFilters({ sort })
  }

  const handleStartEdit = (id: string, currentTranslation: string) => {
    setEditingId(id)
    setEditValue(currentTranslation)
  }

  const handleSaveEdit = async (id: string) => {
    await editWord(id, { translation: editValue })
    setEditingId(null)
  }

  const handleDelete = async (id: string) => {
    if (deletingId === id) {
      await removeWord(id)
      setDeletingId(null)
    } else {
      setDeletingId(id)
      setTimeout(() => setDeletingId(prev => prev === id ? null : prev), 3000)
    }
  }

  const vocabContent = (
    <div className="vocab-page">
      {!embedded && <h1>{t('vocabulary.title')}</h1>}

      {error && (
          <div className="vocab-error">{error}</div>
        )}

        {/* Stats bar */}
        {stats && (
          <div className="vocab-stats-bar">
            <div className="vocab-stat">
              <span className="vocab-stat__value">{stats.totalWords}</span>
              <span className="vocab-stat__label">{t('vocabulary.totalWords')}</span>
            </div>
            <div className="vocab-stat">
              <span className="vocab-stat__value">{stats.dueNow}</span>
              <span className="vocab-stat__label">{t('vocabulary.dueToday')}</span>
            </div>
            <div className="vocab-stat">
              <span className="vocab-stat__value">{stats.byStage.mastered}</span>
              <span className="vocab-stat__label">{t('vocabulary.mastered')}</span>
            </div>
            <div className="vocab-stat">
              <span className="vocab-stat__value">{stats.streak}d</span>
              <span className="vocab-stat__label">{t('vocabulary.stats.streak')}</span>
            </div>
            {stats.practicedToday > 0 && (
              <div className="vocab-stat">
                <span className="vocab-stat__value">{stats.practicedToday}</span>
                <span className="vocab-stat__label">{t('vocabulary.stats.practicedToday')}</span>
              </div>
            )}
          </div>
        )}

        {/* Review / Practice buttons */}
        {stats && (stats.dueNow > 0 || stats.totalWords > 0) && (
          <div className="vocab-review-actions">
            {stats.dueNow > 0 && (
              <button
                className="vocab-review-btn"
                onClick={() => navigate(getLocalizedPath('/words/review'))}
              >
                {t('vocabulary.startReview')} ({stats.dueNow})
              </button>
            )}
            {stats.totalWords > 0 && (
              <button
                className="vocab-review-btn vocab-review-btn--practice"
                onClick={() => navigate(getLocalizedPath('/words/review') + '?mode=practice')}
              >
                {t('vocabulary.startPractice')}
              </button>
            )}
          </div>
        )}

        {/* Filters */}
        <div className="vocab-filters">
          <div className="vocab-tabs" role="tablist">
            {['all', 'new', 'learning', 'mastered'].map(tab => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className={`vocab-tab ${activeTab === tab ? 'vocab-tab--active' : ''}`}
                onClick={() => handleTabChange(tab)}
              >
                {t(`vocabulary.filters.${tab}`)}
              </button>
            ))}
          </div>
          <div className="vocab-controls">
            <input
              type="text"
              className="vocab-search"
              placeholder={t('vocabulary.filters.search')}
              aria-label={t('vocabulary.filters.search')}
              value={search}
              onChange={e => handleSearch(e.target.value)}
            />
            <select
              className="vocab-sort"
              value={filters.sort || 'recent'}
              onChange={e => handleSort(e.target.value)}
              aria-label={t('vocabulary.sort.recent')}
            >
              <option value="recent">{t('vocabulary.sort.recent')}</option>
              <option value="alphabetical">{t('vocabulary.sort.alphabetical')}</option>
              <option value="due">{t('vocabulary.sort.due')}</option>
              <option value="stage">{t('vocabulary.sort.stage')}</option>
            </select>
          </div>
        </div>

        {/* Word list */}
        {words.length === 0 ? (
          <EmptyState icon="📝" title={t('vocabulary.empty')} buttonLabel={t('library.browseBooks')} buttonTo="/books" />
        ) : (
          <div className="vocab-list">
            {words.map(w => (
              <div
                key={w.id}
                className={`vocab-word ${expandedId === w.id ? 'vocab-word--expanded' : ''}`}
              >
                <div
                  className="vocab-word__row"
                  onClick={() => setExpandedId(expandedId === w.id ? null : w.id)}
                >
                  <div className="vocab-word__main">
                    <SpeakButton
                      onClick={() => speak(w.word, w.language)}
                      isPlaying={isPlaying}
                    />
                    <span className="vocab-word__text">{w.word}</span>
                    {w.translation && (
                      <span className="vocab-word__translation">{w.translation}</span>
                    )}
                  </div>
                  <div className="vocab-word__meta">
                    <StageBadge stage={w.stage} t={t} />
                    {w.bookTitle && (
                      <span className="vocab-word__book">{w.bookTitle}</span>
                    )}
                  </div>
                </div>

                {expandedId === w.id && (
                  <div className="vocab-word__detail">
                    {w.definition && (
                      <p className="vocab-word__definition">{w.definition}</p>
                    )}
                    {w.hint && (
                      <p className="vocab-word__hint">{w.hint}</p>
                    )}
                    {w.sentence && (
                      <p className="vocab-word__sentence">"{w.sentence}"</p>
                    )}
                    <div className="vocab-word__stats">
                      <span>{t('vocabulary.review.reviewed')}: {w.totalReviews}</span>
                      <span>{t('vocabulary.review.correctRate')}: {w.totalReviews > 0 ? Math.round(w.correctReviews / w.totalReviews * 100) : 0}%</span>
                      {w.nextReviewAt && (
                        <span>{t('vocabulary.dueDate')}: {new Date(w.nextReviewAt).toLocaleDateString()}</span>
                      )}
                    </div>
                    <div className="vocab-word__actions">
                      {editingId === w.id ? (
                        <div className="vocab-word__edit-row">
                          <input
                            type="text"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveEdit(w.id)}
                            autoFocus
                          />
                          <button onClick={() => handleSaveEdit(w.id)}>{t('common.save')}</button>
                          <button onClick={() => setEditingId(null)}>{t('common.cancel')}</button>
                        </div>
                      ) : (
                        <button onClick={() => handleStartEdit(w.id, w.translation || '')}>
                          {t('vocabulary.editTranslation')}
                        </button>
                      )}
                      <button
                        className={`vocab-word__delete ${deletingId === w.id ? 'vocab-word__delete--confirming' : ''}`}
                        onClick={() => handleDelete(w.id)}
                      >
                        {deletingId === w.id ? t('vocabulary.deleteConfirmAction') : t('vocabulary.deleteConfirm')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {total > words.length && (
          <button className="vocab-load-more" onClick={loadMore}>
            {t('vocabulary.loadMore')} ({total - words.length})
          </button>
        )}
      </div>
  )

  if (embedded) return vocabContent

  return (
    <div className="page-container">
      <SeoHead title={t('vocabulary.title')} noindex />
      {vocabContent}
      <Footer />
    </div>
  )
}
