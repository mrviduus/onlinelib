/**
 * Pure "what should ContinueReadingCard show?" picker.
 *
 * Why a pure function: the previous inline implementation in
 * `ContinueReadingCard.tsx` was the most complex logic in the file —
 * it merged four data sources (server library + server progress + user
 * books + local AsyncStorage) using last-write-wins on `updatedAt`
 * timestamps from heterogeneous time formats (epoch ms vs ISO string).
 * That code had at least one bug in its history (segments swap, see
 * the apology comment in the component). Pure function + unit tests
 * make these merge semantics ratchetable.
 *
 * Lives in `@textstack/shared` so both mobile and (future) web home
 * screens use identical merge semantics — users reading on web then
 * checking mobile see the same "Continue Reading" book.
 *
 * Inputs are plain data shapes — no RN, no fetch, no I/O. The mobile
 * ContinueReadingCard adapts API responses and AsyncStorage maps to
 * these shapes before calling.
 */

import type { UserLibraryItem, ReadingProgressDto, UserBookDto } from '../types/api'

/** Local-cache shape for catalog (edition) progress. */
export interface LocalProgressLite {
  chapterSlug: string
  percent: number
  /** Book-wide percent if the reader wrote it. Optional — older entries
   *  predate this field. */
  bookPercent?: number
  /** Epoch ms. */
  updatedAt: number
}

/** Local-cache shape for user-book book-percent. */
export interface UserBookProgressLite {
  bookPercent: number
  /** Epoch ms. */
  updatedAt: number
}

export type ContinueReadingPick =
  | { type: 'edition'; slug: string; title: string; coverPath: string | null; percent: number; chapterSlug: string | null; updatedAtMs: number }
  | { type: 'userbook'; id: string; title: string; coverPath: string | null; percent: number; chapterSlug: string | null; updatedAtMs: number }

export interface ContinueReadingInputs {
  library: UserLibraryItem[]
  serverProgress: ReadingProgressDto[]
  userBooks: UserBookDto[]
  /** editionId → LocalProgressLite */
  localCatalogMap: Map<string, LocalProgressLite>
  /** userBookId → UserBookProgressLite */
  localUserBookMap: Map<string, UserBookProgressLite>
}

/** Grace window where local book-percent is preferred over server's
 *  chapter-percent on the same chapter. Server PUT lands at debounce
 *  intervals after local cache write; without grace, the server's
 *  later timestamp would always win and we'd lose the cached bookPercent.
 *  60s comfortably covers the 2s debounce + network round-trip + clock
 *  skew between device and server. */
const LOCAL_BOOKPERCENT_GRACE_MS = 60_000

/**
 * Pick the single "Continue Reading" book to show on home — the most
 * recently active not-yet-finished book across catalog + user-book sources.
 *
 * Returns `null` when nothing is in progress. Caller renders empty state.
 *
 * Semantics:
 *   - Each item is scored by `updatedAtMs`. Highest wins.
 *   - 100%-complete books are excluded (`>= 1`).
 *   - For catalog books: LWW between server and local, then optionally
 *     swap in local bookPercent if available for the chosen chapter.
 *   - For user-books: server progressPercent is the timestamp anchor;
 *     local bookPercent is preferred for display when within the grace
 *     window (LOCAL_BOOKPERCENT_GRACE_MS).
 */
export function pickContinueReadingBook(input: ContinueReadingInputs): ContinueReadingPick | null {
  const { library, serverProgress, userBooks, localCatalogMap, localUserBookMap } = input

  // Index server progress by editionId for O(1) lookup.
  const progressMap = new Map<string, ReadingProgressDto>()
  for (const p of serverProgress) progressMap.set(p.editionId, p)

  let best: ContinueReadingPick | null = null

  for (const item of library) {
    const pick = pickCatalog(item, progressMap.get(item.editionId), localCatalogMap.get(item.editionId))
    if (!pick) continue
    if (!best || pick.updatedAtMs > best.updatedAtMs) best = pick
  }

  for (const ub of userBooks) {
    const pick = pickUserBook(ub, localUserBookMap.get(ub.id))
    if (!pick) continue
    if (!best || pick.updatedAtMs > best.updatedAtMs) best = pick
  }

  return best
}

function pickCatalog(
  item: UserLibraryItem,
  server: ReadingProgressDto | undefined,
  local: LocalProgressLite | undefined,
): ContinueReadingPick | null {
  const serverMs = parseEpochMs(server?.updatedAt)
  const localMs = local?.updatedAt ?? 0

  let percent: number | null = null
  let chapterSlug: string | null = null
  let updatedAtMs = 0

  if (localMs > serverMs && local) {
    // Local is newer — user just read offline. Prefer bookPercent if
    // reader wrote it; fall back to chapter percent for legacy entries.
    percent = typeof local.bookPercent === 'number' ? local.bookPercent : local.percent
    chapterSlug = local.chapterSlug
    updatedAtMs = localMs
  } else if (server && server.percent != null) {
    percent = server.percent
    chapterSlug = server.chapterSlug
    updatedAtMs = serverMs
    // Multi-device case: server's latest came from the web (chapter % only),
    // but our local cache may have a freshly-written bookPercent for the
    // same chapter that we'd rather show.
    if (local && local.chapterSlug === server.chapterSlug && typeof local.bookPercent === 'number') {
      percent = local.bookPercent
    }
  }

  // `>=` rather than `===` catches NaN too (NaN <= 0 is false; NaN >= 0
  // is false; so we use Number.isFinite + positive). Prior version used
  // `updatedAtMs === 0` which silently let through Date.parse('garbage')
  // → NaN, producing picks with NaN timestamps that broke "best of two"
  // comparisons downstream.
  if (percent == null || percent >= 1 || !Number.isFinite(updatedAtMs) || updatedAtMs <= 0) return null
  return {
    type: 'edition',
    slug: item.slug,
    title: item.title,
    coverPath: item.coverPath,
    percent,
    chapterSlug,
    updatedAtMs,
  }
}

function pickUserBook(ub: UserBookDto, local: UserBookProgressLite | undefined): ContinueReadingPick | null {
  if (ub.status.toLowerCase() !== 'ready') return null
  if (!ub.progressPercent || ub.progressPercent >= 1) return null
  if (!ub.progressUpdatedAt) return null
  const ubMs = parseEpochMs(ub.progressUpdatedAt)
  if (!Number.isFinite(ubMs) || ubMs <= 0) return null

  // Prefer local bookPercent within grace window (covers the 2s debounce
  // + network round-trip + small clock skew between device and server).
  const displayPercent = (local && local.updatedAt >= ubMs - LOCAL_BOOKPERCENT_GRACE_MS)
    ? local.bookPercent
    : ub.progressPercent

  return {
    type: 'userbook',
    id: ub.id,
    title: ub.title || 'Untitled',
    coverPath: ub.coverPath,
    percent: displayPercent,
    chapterSlug: ub.progressChapterSlug,
    updatedAtMs: ubMs,
  }
}

/** Safe timestamp parser. Accepts ISO strings OR epoch ms numbers — backend
 *  contracts can drift (.NET vs node serializers handle DateTime differently),
 *  and the local cache stores epoch ms directly. Returns 0 (interpreted as
 *  "no timestamp" upstream) for null/undefined/empty/garbage inputs. Prevents
 *  NaN from leaking into `updatedAtMs` and corrupting "most recent"
 *  comparisons across both data sources. */
function parseEpochMs(s: string | number | null | undefined): number {
  if (typeof s === 'number') {
    // Reject 0/negative/NaN/Infinity — epoch ms must be a positive finite int.
    return Number.isFinite(s) && s > 0 ? s : 0
  }
  if (typeof s !== 'string' || s.length === 0) return 0
  const ms = Date.parse(s)
  return Number.isFinite(ms) ? ms : 0
}
