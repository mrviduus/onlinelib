import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from '../hooks/useTranslation'
import { SeoHead } from '../components/SeoHead'
import { Footer } from '../components/Footer'
import { VocabularyPage } from './VocabularyPage'
import { HighlightsPage } from './HighlightsPage'

type Tab = 'vocabulary' | 'highlights'

export function WordsPage() {
  const { isAuthenticated } = useAuth()
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab: Tab = searchParams.get('tab') === 'highlights' ? 'highlights' : 'vocabulary'

  if (!isAuthenticated) {
    return (
      <div className="words-page">
        <p className="vocab-loading">{t('vocabulary.signInPrompt')}</p>
        <Footer />
      </div>
    )
  }

  return (
    <div className="words-page">
      <SeoHead title={t('nav.words')} />
      <div className="words-page__tabs">
        <button
          className={`words-page__tab ${activeTab === 'vocabulary' ? 'words-page__tab--active' : ''}`}
          onClick={() => setSearchParams({})}
        >
          {t('words.tabs.vocabulary')}
        </button>
        <button
          className={`words-page__tab ${activeTab === 'highlights' ? 'words-page__tab--active' : ''}`}
          onClick={() => setSearchParams({ tab: 'highlights' })}
        >
          {t('words.tabs.highlights')}
        </button>
      </div>

      {activeTab === 'vocabulary' ? <VocabularyPage embedded /> : <HighlightsPage embedded />}
    </div>
  )
}
