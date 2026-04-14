import { useTranslation } from '../hooks/useTranslation'
import { SeoHead } from '../components/SeoHead'
import { VocabularyPage } from './VocabularyPage'

export function WordsPage() {
  const { t } = useTranslation()

  return (
    <div className="words-page">
      <SeoHead title={t('nav.words')} />
      <VocabularyPage embedded />
    </div>
  )
}
