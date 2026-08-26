import { useCallback, useEffect, useRef, MutableRefObject } from 'react'
import { useFlushOnBackground } from './useFlushOnBackground'
import type { ProgressSnapshot, SavedPosition } from '../components/reader/readerSource'

type Options = {
  /** editionId (catalog) or userBookId (user-book). null disables I/O.
   *  Also the trigger that re-loads the saved position once it resolves. */
  bookKey: string | null
  /** URL chapter slug. Changing it = new chapter → reset + re-restore. */
  chapterSlug: string | undefined
  /** Loaded chapter id — null until the chapter fetch lands. */
  chapterId: string | null
  injectJs: (js: string) => void

  // Live scroll refs (mutated by ReaderShell on the WebView 'progress' msg).
  progressRef: MutableRefObject<number>
  scrollOffsetRef: MutableRefObject<number>
  currentChapterSlugRef: MutableRefObject<string | null>
  bookProgressRef: MutableRefObject<number | null>

  /** Source-specific write. MUST be stable (wrap in useCallback). */
  persist: (snap: ProgressSnapshot) => void
  /** Source-specific read of the saved resume position for a chapter.
   *  MUST be stable (wrap in useCallback). */
  loadPosition: (chapterSlug: string) => Promise<SavedPosition>
}

/**
 * The ONE place reading-progress is saved and restored, shared by both the
 * catalog and the user-book reader. Replaces the two divergent progress hooks
 * (`useReaderProgress` / `useUserBookProgress`) plus the two copy-pasted
 * restore effects that lived inline in the route files.
 *
 * Save cadence (matches web `useReadingProgress`):
 *   - `bumpProgress()` — 2s-debounced save during scrolling.
 *   - `saveProgress()` — synchronous flush on unmount / AppState background.
 *
 * Restore (the bug this consolidation kills):
 *   The saved position is fetched ASYNCHRONOUSLY, but inline HTML loads fast,
 *   so `onLoadEnd` often fired BEFORE the position arrived — and since restore
 *   ran once, guarded, it was skipped forever → "always returns to top of
 *   chapter". We now gate restore on BOTH signals via a tiny state machine:
 *   restore fires only when `webViewLoaded && positionLoaded`, whichever lands
 *   last. No race, both readers, offset OR percent.
 */
export function useReaderPersistence({
  bookKey,
  chapterSlug,
  chapterId,
  injectJs,
  progressRef,
  scrollOffsetRef,
  currentChapterSlugRef,
  bookProgressRef,
  persist,
  loadPosition,
}: Options) {
  // Restore state machine — all refs so changes never trigger a re-render.
  const savedOffsetRef = useRef<number | null>(null)
  const savedPercentRef = useRef<number | null>(null)
  const restoredRef = useRef(false)
  const webViewLoadedRef = useRef(false)
  const positionLoadedRef = useRef(false)

  const tryRestore = useCallback(() => {
    if (restoredRef.current) return
    if (!webViewLoadedRef.current || !positionLoadedRef.current) return
    // Both signals in — fire exactly once for this chapter mount.
    restoredRef.current = true
    const offset = savedOffsetRef.current
    const pct = savedPercentRef.current
    if (offset != null) {
      injectJs(`window.__textstackRestoreScroll && window.__textstackRestoreScroll(${offset})`)
    } else if (pct != null) {
      injectJs(`requestAnimationFrame(function(){ window.scrollTo(0, Math.round(document.documentElement.scrollHeight * ${pct})); });`)
    }
    // No saved position → leave at top (restoredRef already set so we stop).
  }, [injectJs])

  // Signalled by ReaderShell's onLoadEnd.
  const onWebViewLoaded = useCallback(() => {
    // Already restored this chapter once → this onLoadEnd is a settings-driven
    // HTML rebuild (font/theme/spacing change reloads the WebView to the top).
    // Re-apply the live position by PERCENT, not pixels: the new font size
    // re-flows the content so the old pixel offset points elsewhere, but the
    // relative position holds. Keeps the reader in place when a setting is
    // changed mid-chapter instead of dumping it to the top. (Bug report #1.)
    if (restoredRef.current) {
      const pct = progressRef.current
      if (Number.isFinite(pct) && pct > 0.001) {
        injectJs(`requestAnimationFrame(function(){ window.scrollTo(0, Math.round(document.documentElement.scrollHeight * ${pct})); });`)
      }
      return
    }
    webViewLoadedRef.current = true
    tryRestore()
  }, [tryRestore, injectJs, progressRef])

  // Pending-save buffer: chapterId resolves AFTER the chapter fetch lands, so a
  // save requested during rapid chapter tap-through (e.g. emit-on-load firing
  // before the destination chapter's id is known) would early-return and the
  // destination chapter's first progress would be lost. Instead we stash a flag
  // and replay the save once chapterId resolves (effect below). We don't snapshot
  // the payload values — saveProgress already reads the live refs at flush time,
  // which carry the latest scroll/percent for the destination chapter.
  const pendingSaveRef = useRef(false)

  const saveProgress = useCallback(() => {
    if (!bookKey || !chapterSlug) return
    // NOTE: a missing chapterId does NOT block the save. The offline cache
    // stores chapters by slug and has no server id to give (`id: ''` in
    // useReaderChapter), so gating on it meant every save while offline was
    // deferred — and the replay effect below, gated the same way, never fired.
    // Read three chapters on a plane, close the app, lose all of it. The slug
    // is what the local record is keyed by; each source decides for itself
    // whether it has enough to also write to the server.
    const slug = currentChapterSlugRef.current || chapterSlug
    persist({
      chapterId,
      chapterSlug: slug,
      chapterPercent: progressRef.current,
      scrollOffset: scrollOffsetRef.current,
      bookPercent: bookProgressRef.current,
      updatedAt: Date.now(),
    })
    // Saved locally, but the server write needs a real chapter id. Remember to
    // repeat the save if one arrives (chapter fetch lands, or the device comes
    // back online and the next chapter resolves normally).
    pendingSaveRef.current = !chapterId
  }, [bookKey, chapterId, chapterSlug, persist, currentChapterSlugRef, progressRef, scrollOffsetRef, bookProgressRef])

  // Re-save once the chapter id lands, so the server gets the write that the
  // local store already has. Harmless when the id was there from the start.
  useEffect(() => {
    if (chapterId && pendingSaveRef.current) {
      pendingSaveRef.current = false
      saveProgress()
    }
  }, [chapterId, saveProgress])

  // 2s-debounced save fired on every WebView progress bump. Short enough that
  // a force-kill mid-chapter loses < ~2s of scroll, long enough that fast
  // scrubbing doesn't spam writes.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bumpProgress = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      saveProgress()
    }, 2000)
  }, [saveProgress])

  // Load saved position + reset the restore machine whenever the chapter (or
  // the resolved bookKey) changes. One-shot per (bookKey, chapterSlug).
  useEffect(() => {
    restoredRef.current = false
    webViewLoadedRef.current = false
    positionLoadedRef.current = false
    savedOffsetRef.current = null
    savedPercentRef.current = null
    pendingSaveRef.current = false
    if (!bookKey || !chapterSlug) return
    let cancelled = false
    loadPosition(chapterSlug)
      .then(pos => {
        if (cancelled) return
        savedOffsetRef.current = pos.offset
        savedPercentRef.current = pos.percent
        positionLoadedRef.current = true
        tryRestore()
      })
      .catch(() => {
        if (cancelled) return
        positionLoadedRef.current = true
        tryRestore()
      })
    return () => { cancelled = true }
  }, [bookKey, chapterSlug, loadPosition, tryRestore])

  // Always points at the current closure, so the unmount flush below can have
  // an empty dependency list without going stale.
  const saveProgressRef = useRef(saveProgress)
  saveProgressRef.current = saveProgress

  // Flush on unmount — covers tab-away and a killed screen in a single tap.
  //
  // Depending on `saveProgress` here made this cleanup fire on every chapter
  // change too, and that was destructive: `navigateChapter` saves the real
  // position, THEN zeroes the live refs, THEN pushes the route. The route
  // change altered `saveProgress`'s identity, so React ran this cleanup with
  // the OLD chapter's closure over the freshly ZEROED refs and persisted
  // `percent: 0, locator: scroll:<old-slug>:0`. Until the destination chapter
  // emitted its first progress message, the only stored position for the book
  // was "the chapter you just left, at the top" — and killing the app in that
  // window, or navigating offline, made that the position you came back to.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      saveProgressRef.current()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Android OS-kill skips React cleanup; AppState background fires first so we
  // get one last sync write of scroll position + book-percent cache.
  useFlushOnBackground(saveProgress)

  return { saveProgress, bumpProgress, onWebViewLoaded }
}
