import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { useLanguage } from '../context/LanguageContext'
import type { Chapter, BookDetail } from '../types/api'
import { useReaderSettings } from '../hooks/useReaderSettings'
import { useAutoHideBar } from '../hooks/useAutoHideBar'
import { useReadingProgress } from '../hooks/useReadingProgress'
import { SeoHead } from '../components/SeoHead'
import { ReaderTopBar } from '../components/reader/ReaderTopBar'
import { ReaderContent } from '../components/reader/ReaderContent'
import { ReaderFooterNav } from '../components/reader/ReaderFooterNav'
import { ReaderSettingsDrawer } from '../components/reader/ReaderSettingsDrawer'
import { ReaderTocDrawer } from '../components/reader/ReaderTocDrawer'

export function ReaderPage() {
  const { bookSlug, chapterSlug } = useParams<{ bookSlug: string; chapterSlug: string }>()
  const api = useApi()
  const { getLocalizedPath } = useLanguage()
  const navigate = useNavigate()
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [book, setBook] = useState<BookDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const { settings, update } = useReaderSettings()
  const { visible, toggle } = useAutoHideBar()
  const { scrollPercent } = useReadingProgress(bookSlug || '', chapterSlug || '')

  // Fetch chapter and book data
  useEffect(() => {
    if (!bookSlug || !chapterSlug) return

    setLoading(true)
    setError(null)

    Promise.all([
      api.getChapter(bookSlug, chapterSlug),
      api.getBook(bookSlug),
    ])
      .then(([ch, bk]) => {
        setChapter(ch)
        setBook(bk)
        window.scrollTo(0, 0)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [bookSlug, chapterSlug, api])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && chapter?.prev) {
        navigate(getLocalizedPath(`/books/${bookSlug}/${chapter.prev.slug}`))
      } else if (e.key === 'ArrowRight' && chapter?.next) {
        navigate(getLocalizedPath(`/books/${bookSlug}/${chapter.next.slug}`))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [bookSlug, chapter, navigate, getLocalizedPath])

  if (loading) {
    return (
      <div className="reader-loading">
        <div className="reader-loading__skeleton" />
        <div className="reader-loading__skeleton" />
        <div className="reader-loading__skeleton" />
      </div>
    )
  }

  if (error || !chapter || !book) {
    return (
      <div className="reader-error">
        <h2>Error loading chapter</h2>
        <p>{error || 'Chapter not found'}</p>
      </div>
    )
  }

  const seoTitle = `${chapter.title} — ${book.title}`
  const seoDescription = `Read ${chapter.title} from ${book.title} online | TextStack`

  return (
    <div className="reader-page">
      <SeoHead title={seoTitle} description={seoDescription} />
      <ReaderTopBar
        visible={visible}
        bookSlug={bookSlug!}
        title={book.title}
        chapterTitle={chapter.title}
        scrollPercent={scrollPercent}
        onTocClick={() => setTocOpen(true)}
        onSettingsClick={() => setSettingsOpen(true)}
      />

      <main className="reader-main">
        <ReaderContent html={chapter.html} settings={settings} onTap={toggle} />
      </main>

      <ReaderFooterNav bookSlug={bookSlug!} prev={chapter.prev} next={chapter.next} />

      <ReaderTocDrawer
        open={tocOpen}
        bookSlug={bookSlug!}
        chapters={book.chapters}
        currentChapterSlug={chapterSlug!}
        onClose={() => setTocOpen(false)}
      />

      <ReaderSettingsDrawer
        open={settingsOpen}
        settings={settings}
        onUpdate={update}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
