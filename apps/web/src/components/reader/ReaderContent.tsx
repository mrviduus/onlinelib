import { useEffect, useLayoutEffect, useRef, useCallback, Fragment } from 'react'
import type { ReaderSettings } from '../../hooks/useReaderSettings'
import type { LoadedChapter } from '../../hooks/useScrollReader'
import { sanitizeHtml } from '../../utils/sanitize'

const DOUBLE_TAP_DELAY = 300 // ms

interface Props {
  chapters: LoadedChapter[]
  settings: ReaderSettings
  isLoadingMore: boolean
  onLoadMore: () => void
  onLoadPrev?: () => void
  chapterRefs: React.MutableRefObject<Map<string, HTMLElement>>
  onTap?: () => void
  onDoubleTap?: () => void
}

function getFontFamily(family: ReaderSettings['fontFamily']): string {
  switch (family) {
    case 'serif':
      return 'Georgia, "Times New Roman", serif'
    case 'sans':
      return '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    case 'dyslexic':
      return '"OpenDyslexic", sans-serif'
  }
}

export function ReaderContent({
  chapters,
  settings,
  isLoadingMore,
  onLoadMore,
  onLoadPrev,
  chapterRefs,
  onTap,
  onDoubleTap,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const bottomSentinelRef = useRef<HTMLDivElement>(null)
  const topSentinelRef = useRef<HTMLDivElement>(null)
  const fontFamily = getFontFamily(settings.fontFamily)
  const lastTapRef = useRef<number>(0)
  const tapTimeoutRef = useRef<number | null>(null)
  const prevScrollHeightRef = useRef<number>(0)
  const prevFirstIndexRef = useRef<number>(-1)

  // Capture-phase error listener for images (error events don't bubble).
  // Retry once after 1s (survives transient 503s from burst rate-limiting),
  // mark as broken on second fail so CSS can show a placeholder.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const handleError = (e: Event) => {
      const target = e.target as HTMLElement
      if (!target || target.tagName !== 'IMG') return
      const img = target as HTMLImageElement
      if (img.dataset.broken === '1') return
      if (img.dataset.retried === '1') {
        img.dataset.broken = '1'
        return
      }
      img.dataset.retried = '1'
      const original = img.getAttribute('src')
      if (!original) return
      window.setTimeout(() => {
        const sep = original.includes('?') ? '&' : '?'
        img.src = `${original}${sep}r=1`
      }, 1000)
    }

    root.addEventListener('error', handleError, true)
    return () => root.removeEventListener('error', handleError, true)
  }, [chapters.length])

  // Handle tap with double-tap detection for fullscreen
  const handleClick = useCallback((e: React.MouseEvent) => {
    // Don't trigger on links
    const target = e.target as HTMLElement
    if (target.tagName === 'A' || target.closest('a')) return

    const now = Date.now()
    const timeSinceLastTap = now - lastTapRef.current

    // Double-tap detected
    if (timeSinceLastTap < DOUBLE_TAP_DELAY) {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current)
        tapTimeoutRef.current = null
      }
      lastTapRef.current = 0
      // Only call onDoubleTap if it exists, otherwise just ignore (let browser select word)
      if (onDoubleTap) {
        onDoubleTap()
      }
      return
    }

    // First tap - wait to see if it's a double-tap
    lastTapRef.current = now

    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current)
    }

    tapTimeoutRef.current = window.setTimeout(() => {
      tapTimeoutRef.current = null
      onTap?.()
    }, DOUBLE_TAP_DELAY)
  }, [onTap, onDoubleTap])

  // Register chapter ref
  const setChapterRef = useCallback(
    (identifier: string, el: HTMLElement | null) => {
      if (el) {
        chapterRefs.current.set(identifier, el)
      } else {
        chapterRefs.current.delete(identifier)
      }
    },
    [chapterRefs]
  )

  // IntersectionObserver for loading more chapters (bottom)
  useEffect(() => {
    const sentinel = bottomSentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoadingMore) {
          onLoadMore()
        }
      },
      {
        root: null,
        rootMargin: '200px',
        threshold: 0,
      }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [onLoadMore, isLoadingMore])

  // IntersectionObserver for loading previous chapters (top)
  useEffect(() => {
    const sentinel = topSentinelRef.current
    if (!sentinel || !onLoadPrev) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoadingMore) {
          // Snapshot scroll height before prepend
          prevScrollHeightRef.current = document.documentElement.scrollHeight
          prevFirstIndexRef.current = chapters[0]?.index ?? -1
          onLoadPrev()
        }
      },
      {
        root: null,
        rootMargin: '200px',
        threshold: 0,
      }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [onLoadPrev, isLoadingMore, chapters])

  // Preserve scroll position after chapters are prepended
  useLayoutEffect(() => {
    const firstIndex = chapters[0]?.index ?? -1
    if (
      prevFirstIndexRef.current !== -1 &&
      firstIndex !== -1 &&
      firstIndex < prevFirstIndexRef.current &&
      prevScrollHeightRef.current > 0
    ) {
      const newScrollHeight = document.documentElement.scrollHeight
      const delta = newScrollHeight - prevScrollHeightRef.current
      if (delta > 0) {
        window.scrollTo({ top: window.scrollY + delta, behavior: 'instant' })
      }
      prevScrollHeightRef.current = 0
      prevFirstIndexRef.current = -1
    }
  }, [chapters])

  if (chapters.length === 0) {
    return (
      <div className="scroll-reader scroll-reader--loading">
        <div className="scroll-reader__spinner">Loading...</div>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="scroll-reader" onClick={handleClick}>
      {/* Top sentinel for loading previous chapters */}
      {onLoadPrev && chapters[0]?.index > 0 && (
        <>
          {isLoadingMore && (
            <div className="scroll-reader__loading">
              <span>Loading more...</span>
            </div>
          )}
          <div ref={topSentinelRef} className="scroll-reader__sentinel" />
        </>
      )}

      {chapters.map((chapter, i) => (
        <Fragment key={chapter.identifier}>
          {/* Chapter separator (not for first chapter) */}
          {i > 0 && (
            <div className="chapter-separator">
              <div className="chapter-separator__line" />
              <span className="chapter-separator__title">{chapter.title}</span>
              <div className="chapter-separator__line" />
            </div>
          )}

          {/* Chapter content */}
          <article
            ref={(el) => setChapterRef(chapter.identifier, el)}
            className="scroll-reader__chapter"
            data-chapter-id={chapter.identifier}
            data-chapter-index={chapter.index}
            style={{
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
              fontFamily,
              textAlign: settings.textAlign,
            }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(chapter.html) }}
          />
        </Fragment>
      ))}

      {/* Bottom sentinel for infinite scroll */}
      <div ref={bottomSentinelRef} className="scroll-reader__sentinel" />

      {/* Loading indicator */}
      {isLoadingMore && (
        <div className="scroll-reader__loading">
          <span>Loading more...</span>
        </div>
      )}
    </div>
  )
}
