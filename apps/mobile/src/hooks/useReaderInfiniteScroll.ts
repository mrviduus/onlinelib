import { useCallback, useRef, MutableRefObject } from 'react'
import { createBooksApi } from '@textstack/shared'
import type { Chapter, Language } from '@textstack/shared'

type Options = {
  bookSlug: string | undefined
  language: Language
  injectJs: (js: string) => void
  /** Word counter accumulates across appended chapters so reading-session
   * tracking sees the full body the user has scrolled through. */
  wordCountRef: MutableRefObject<number>
}

/**
 * Owns the next-chapter prefetch ref and the WebView's infinite-scroll
 * wiring (`enableInfiniteScroll` / `appendChapter` / `disableInfiniteScroll`).
 *
 * `enableForChapter` is called when the WebView posts `'loaded'` — it
 * primes the ref with the current chapter's `next` and turns the bottom
 * sentinel on.
 *
 * `loadNext` is called when the WebView posts `'requestNextChapter'` —
 * fetches the next chapter, appends its HTML, advances the ref, and
 * disables the sentinel once we hit the end of the book.
 */
export function useReaderInfiniteScroll({ bookSlug, language, injectJs, wordCountRef }: Options) {
  const nextChapterRef = useRef<{ slug: string; title: string } | null>(null)

  const enableForChapter = useCallback((chapter: Chapter | null) => {
    if (chapter?.next) {
      nextChapterRef.current = chapter.next
      injectJs('enableInfiniteScroll()')
    }
  }, [injectJs])

  const loadNext = useCallback(async () => {
    const next = nextChapterRef.current
    if (!next || !bookSlug) return
    try {
      const api = createBooksApi(language)
      const ch = await api.getChapter(bookSlug, next.slug)
      injectJs(`appendChapter(${JSON.stringify({ html: ch.html, title: ch.title, slug: ch.slug })})`)
      wordCountRef.current += ch.wordCount || 0
      nextChapterRef.current = ch.next || null
      if (!ch.next) injectJs('disableInfiniteScroll()')
    } catch {
      injectJs('disableInfiniteScroll()')
    }
  }, [bookSlug, language, injectJs, wordCountRef])

  return { enableForChapter, loadNext }
}
