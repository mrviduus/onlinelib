import { useAuth } from '../context/AuthContext'
import { useTranslation } from '../hooks/useTranslation'
import { SeoHead } from '../components/SeoHead'
import { Footer } from '../components/Footer'
import { VocabularyPage } from './VocabularyPage'

export function WordsPage() {
  const { isAuthenticated } = useAuth()
  const { t } = useTranslation()

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
      <VocabularyPage embedded />
    </div>
  )
}
