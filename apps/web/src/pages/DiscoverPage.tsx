import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from '../hooks/useTranslation'
import { useLibrarian } from '../hooks/useLibrarian'
import { isValidLibrarianQuery, MAX_QUERY_LENGTH } from '../api/librarian'
import { LibrarianResults } from '../components/librarian/LibrarianResults'
import { SeoHead } from '../components/SeoHead'
import { EmptyState } from '../components/EmptyState'
import { Footer } from '../components/Footer'

// "Ask the librarian" — natural-language book discovery (AI-Agent-3). The differentiator is the agent's
// visible REASONING + ranked, grounded recommendations. Mounted at /:lang/discover, reached from the Discover
// menu. Auth required (it's a /me/ endpoint), so signed-out users get a sign-in CTA.
export function DiscoverPage() {
  const { isAuthenticated, isLoading, openAuthModal } = useAuth()
  const { t } = useTranslation()
  const librarian = useLibrarian()
  const [input, setInput] = useState('')

  const canSubmit = isValidLibrarianQuery(input) && librarian.phase !== 'asking'

  const submit = () => {
    if (!canSubmit) return
    void librarian.run(input.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter submits, Shift+Enter inserts a newline (it's a multi-line prompt).
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <>
      <div className="discover-page">
        <SeoHead title={t('librarian.title')} description={t('librarian.subtitle')} noindex />

        <div className="discover-page__intro">
          <h1 className="discover-page__title">{t('librarian.title')}</h1>
          <p className="discover-page__subtitle">{t('librarian.subtitle')}</p>
        </div>

        <div className="discover-page__ask">
          <textarea
            className="discover-page__input"
            placeholder={t('librarian.placeholder')}
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_QUERY_LENGTH))}
            onKeyDown={handleKeyDown}
            rows={3}
            maxLength={MAX_QUERY_LENGTH}
            aria-label={t('librarian.inputLabel')}
          />
          <button
            className="discover-page__submit"
            onClick={submit}
            disabled={!canSubmit}
          >
            {librarian.phase === 'asking' ? t('librarian.thinkingShort') : t('librarian.ask')}
          </button>
        </div>

        {/* Auth gate — the librarian is a /me/ endpoint. Don't even let signed-out users fire a request. */}
        {!isLoading && !isAuthenticated && (
          <EmptyState
            icon="📚"
            title={t('librarian.signIn.title')}
            subtitle={t('librarian.signIn.subtitle')}
            buttonLabel={t('librarian.signIn.cta')}
            onButtonClick={openAuthModal}
          />
        )}

        {isAuthenticated && (
          <div className="discover-page__output">
            {librarian.phase === 'asking' && (
              <div className="librarian-thinking">
                <span className="librarian-thinking__spinner" aria-hidden />
                <p className="librarian-thinking__text">{t('librarian.thinking')}</p>
              </div>
            )}

            {librarian.phase === 'error' && (
              <EmptyState
                icon="⚠️"
                title={t('librarian.error.title')}
                subtitle={librarian.error || t('librarian.error.subtitle')}
                buttonLabel={t('librarian.error.retry')}
                onButtonClick={librarian.retry}
              />
            )}

            {librarian.phase === 'empty' && (
              <EmptyState
                icon="🔍"
                title={t('librarian.empty.title')}
                subtitle={t('librarian.empty.subtitle')}
              />
            )}

            {librarian.phase === 'results' && librarian.response && (
              <LibrarianResults response={librarian.response} t={t} />
            )}
          </div>
        )}
      </div>
      <Footer />
    </>
  )
}
