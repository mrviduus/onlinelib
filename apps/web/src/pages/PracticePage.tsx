import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { useTranslation } from '../hooks/useTranslation'
import { getVocabStats, getVocabDailyStats, getWords, type VocabStatsDto, type VocabDailyStatDto, type VocabWordDto } from '../api/vocabulary'
import { REVIEW_BATCH_SIZES, DEFAULT_BATCH_SIZE, type ReviewMode } from '../lib/vocabularyConstants'
import { SeoHead } from '../components/SeoHead'
import { Footer } from '../components/Footer'
import { EmptyState } from '../components/EmptyState'

function formatNextDue(nextReviewAt: string): string {
  const now = new Date()
  const due = new Date(nextReviewAt)
  const diffMs = due.getTime() - now.getTime()
  if (diffMs <= 0) return 'Now'
  const diffH = diffMs / (1000 * 60 * 60)
  if (diffH < 24) return 'Today'
  const diffD = Math.ceil(diffH / 24)
  if (diffD === 1) return 'Tomorrow'
  if (diffD <= 7) return `In ${diffD} days`
  if (diffD <= 30) return `In ${Math.ceil(diffD / 7)} weeks`
  return `In ${Math.ceil(diffD / 30)} months`
}

const STAGE_LABELS = ['New', 'Recognition', 'Recall', 'Context', 'Mastered']
const STAGE_COUNT = 5

function getLast7Days(dailyStats: VocabDailyStatDto[]) {
  const today = new Date()
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const statsMap = new Map(dailyStats.map(d => [d.date.split('T')[0], d]))
  const result: { day: string; reviewed: number; added: number }[] = []

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().split('T')[0]
    const stat = statsMap.get(key)
    result.push({
      day: days[d.getDay()],
      reviewed: stat?.reviewCount ?? 0,
      added: stat?.wordsAdded ?? 0,
    })
  }
  return result
}

export function PracticePage() {
  const { isAuthenticated } = useAuth()
  const { getLocalizedPath } = useLanguage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [stats, setStats] = useState<VocabStatsDto | null>(null)
  const [dailyStats, setDailyStats] = useState<VocabDailyStatDto[]>([])
  const [allWords, setAllWords] = useState<VocabWordDto[]>([])
  const [allWordsTotal, setAllWordsTotal] = useState(0)
  const [reviewMode, setReviewMode] = useState<ReviewMode>(() =>
    (localStorage.getItem('practiceMode') as ReviewMode) || 'classic'
  )
  const [batchSize, setBatchSize] = useState(() => {
    const saved = parseInt(localStorage.getItem('practiceBatch') || '', 10)
    return (REVIEW_BATCH_SIZES as readonly number[]).includes(saved) ? saved : DEFAULT_BATCH_SIZE
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) return
    const tz = new Date().getTimezoneOffset()
    Promise.all([
      getVocabStats(),
      getVocabDailyStats(tz),
      getWords({ sort: 'due', limit: 20 }),
    ])
      .then(([s, d, w]) => {
        setStats(s)
        setDailyStats(d)
        setAllWords(w.items)
        setAllWordsTotal(w.total)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isAuthenticated])

  const handleModeChange = (m: ReviewMode) => {
    setReviewMode(m)
    localStorage.setItem('practiceMode', m)
  }

  const handleBatchChange = (n: number) => {
    setBatchSize(n)
    localStorage.setItem('practiceBatch', String(n))
  }

  const dueCount = stats?.dueNow ?? 0
  const totalWords = stats?.totalWords ?? 0

  const handleStart = () => {
    const params = new URLSearchParams()
    params.set('reviewMode', reviewMode)
    if (batchSize !== DEFAULT_BATCH_SIZE) params.set('limit', String(batchSize))
    navigate(getLocalizedPath('/words/review') + '?' + params.toString())
  }

  const bannerContent = () => {
    if (!stats) return null
    if (totalWords === 0) return { title: 'Start building your vocabulary', subtitle: 'Save words while reading to practice them here.' }
    if (stats.reviewedToday > 0) {
      const sub = dueCount === 0 ? 'Practice more to strengthen memory.'
        : stats.correctRateToday >= 80 ? 'Great accuracy!' : 'Every review counts!'
      return { title: `You've Reviewed ${stats.reviewedToday} Words Today!`, subtitle: sub }
    }
    if (dueCount > 0) return { title: `${dueCount} words waiting for review`, subtitle: 'Keep your streak going!' }
    return { title: 'Ready to practice!', subtitle: 'Strengthen your vocabulary by reviewing words.' }
  }

  const practiceLabel = () => {
    const label = t('vocabulary.startPractice')
    const count = dueCount > 0 ? Math.min(batchSize, dueCount) : totalWords > 0 ? Math.min(batchSize, totalWords) : 0
    return count > 0 ? `${label} (${count} words)` : label
  }

  const banner = bannerContent()
  const chartData = getLast7Days(dailyStats)

  return (
    <div className="page-container">
      <SeoHead title={t('nav.practice')} noindex />
      <div className="practice-page">
        {!isAuthenticated && (
          <EmptyState
            icon="🎴"
            title={t('practice.empty.title')}
            subtitle={t('practice.empty.subtitle')}
            buttonLabel={t('practice.empty.cta')}
            buttonTo="/books"
          />
        )}

        {isAuthenticated && loading && (
          <p className="vocab-loading">{t('common.loading')}</p>
        )}

        {isAuthenticated && !loading && (
          <>
            {/* Motivational banner */}
            {banner && (
              <div className="practice-page__banner">
                <div className="practice-page__banner-content">
                  <div className="practice-page__banner-title">{banner.title}</div>
                  {banner.subtitle && <div className="practice-page__banner-subtitle">{banner.subtitle}</div>}
                </div>
                {stats && stats.streak > 0 && (
                  <div className="practice-page__banner-streak">
                    <span className="practice-page__banner-streak-num">{stats.streak}</span>
                    <span className="practice-page__banner-streak-label">day streak</span>
                  </div>
                )}
              </div>
            )}

            {/* Stats row */}
            {stats && totalWords > 0 && (
              <div className="practice-page__stats">
                <div className="practice-page__stat">
                  <span className="practice-page__stat-value">{totalWords}</span>
                  <span className="practice-page__stat-label">{t('vocabulary.totalWords')}</span>
                </div>
                <div className="practice-page__stat">
                  <span className="practice-page__stat-value practice-page__stat-value--primary">{dueCount}</span>
                  <span className="practice-page__stat-label">{t('vocabulary.dueToday')}</span>
                </div>
                <div className="practice-page__stat">
                  <span className="practice-page__stat-value">{stats.byStage.mastered}</span>
                  <span className="practice-page__stat-label">{t('vocabulary.mastered')}</span>
                </div>
              </div>
            )}

            {/* Start practice card */}
            {stats && totalWords > 0 && (
              <div className="practice-page__card">
                <div className="practice-page__settings">
                  <div className="practice-page__setting">
                    <span className="practice-page__setting-label">Mode</span>
                    <div className="vocab-mode-toggle">
                      {(['classic', 'blitz'] as ReviewMode[]).map(m => (
                        <button
                          key={m}
                          className={`vocab-mode-toggle__btn ${reviewMode === m ? 'vocab-mode-toggle__btn--active' : ''}`}
                          onClick={() => handleModeChange(m)}
                        >
                          {m === 'blitz' ? 'Blitz' : 'Flashcards'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="practice-page__setting">
                    <span className="practice-page__setting-label">Length</span>
                    <div className="review-summary__batch-row">
                      {REVIEW_BATCH_SIZES.map(n => (
                        <button
                          key={n}
                          className={`review-summary__batch-chip ${batchSize === n ? 'review-summary__batch-chip--active' : ''}`}
                          onClick={() => handleBatchChange(n)}
                        >
                          {n} words
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  className="practice-page__start-btn"
                  onClick={handleStart}
                >
                  {practiceLabel()}
                </button>
              </div>
            )}

            {/* Weekly activity — area chart */}
            {stats && totalWords > 0 && dailyStats.length > 0 && (
              <div className="practice-page__section">
                <h3 className="practice-page__section-title">Practice Every Day</h3>
                <div style={{ width: '100%', height: 180 }}>
                  <ResponsiveContainer>
                    <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13 }}
                        labelStyle={{ color: 'var(--color-text)', fontWeight: 600 }}
                      />
                      <Area type="monotone" dataKey="reviewed" name="Reviewed" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.15} strokeWidth={2} dot={{ r: 3, fill: '#60a5fa' }} />
                      <Area type="monotone" dataKey="added" name="Added" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} strokeWidth={2} dot={{ r: 3, fill: '#22c55e' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* My Vocabulary — all words SRS progress */}
            {stats && totalWords > 0 && (
              <div className="practice-page__section">
                <div className="practice-page__section-header">
                  <h3 className="practice-page__section-title">
                    My Vocabulary · {totalWords} words
                    {stats.reviewedToday > 0 && (
                      <span className="practice-page__reviewed-badge">✓ {stats.reviewedToday} reviewed today</span>
                    )}
                  </h3>
                  {allWordsTotal > 20 && (
                    <a href={getLocalizedPath('/words')} className="practice-page__section-link">View all</a>
                  )}
                </div>

                {allWords.length === 0 ? (
                  <p className="practice-page__empty">Save words while reading to track your progress here.</p>
                ) : (
                  <div className="practice-page__table">
                    <div className="practice-page__table-header">
                      <span className="practice-page__table-col practice-page__table-col--word">Word</span>
                      <span className="practice-page__table-col practice-page__table-col--translation">Translation</span>
                      <span className="practice-page__table-col practice-page__table-col--progress">Progress</span>
                      <span className="practice-page__table-col practice-page__table-col--due">Next Due</span>
                    </div>
                    {allWords.map(w => {
                      const accuracy = w.totalReviews > 0 ? Math.round((w.correctReviews / w.totalReviews) * 100) : 0
                      return (
                        <div key={w.id} className="practice-page__table-row">
                          <span className="practice-page__table-col practice-page__table-col--word">{w.word}</span>
                          <span className="practice-page__table-col practice-page__table-col--translation">{w.translation || '—'}</span>
                          <span className="practice-page__table-col practice-page__table-col--progress">
                            <div className="practice-page__progress">
                              <div className="practice-page__progress-bar">
                                {Array.from({ length: STAGE_COUNT }).map((_, i) => (
                                  <div
                                    key={i}
                                    className={`practice-page__progress-step ${i <= w.stage ? 'practice-page__progress-step--filled' : ''} ${i === w.stage ? 'practice-page__progress-step--current' : ''}`}
                                  />
                                ))}
                              </div>
                              <span className="practice-page__progress-label">
                                {w.stage === 4 ? '✓ Mastered' : `${STAGE_LABELS[w.stage]}`}
                                {w.totalReviews > 0 && ` · ${accuracy}%`}
                              </span>
                            </div>
                          </span>
                          <span className="practice-page__table-col practice-page__table-col--due">{formatNextDue(w.nextReviewAt)}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      <Footer />
    </div>
  )
}
