/**
 * "3m ago", and what to do when the clock says the future.
 *
 * QA saw **"Last read −1m ago"** immediately after a write. `Math.floor` on a
 * negative difference rounds AWAY from zero, so a skew of one millisecond into
 * the future produces `-1`. There was no clamp and no "just now" bucket, so a
 * genuinely fresh write also read "0m ago".
 *
 * The skew is not hypothetical, and it is not the device being wrong. The field
 * holds two different clocks: catalog progress is stamped by the SERVER
 * (`UserDataEndpoints`), user-book progress is stamped by the server too since
 * ADR-013 — but the mobile client also writes an optimistic client-clock value
 * into the same map before a refetch lands (`useBookActions`). One formatter,
 * two sources, compared against the device clock.
 *
 * So this treats the future as now rather than trying to be clever about it: a
 * timestamp slightly ahead means "a moment ago" in every case a reader cares
 * about, and a timestamp wildly ahead is a broken clock that no phrasing fixes.
 */

/** Below this, say "just now" rather than a number. */
export const JUST_NOW_MS = 60_000

export function formatTimeAgo(
  dateStr: string | null | undefined,
  now: number = Date.now(),
): string {
  if (!dateStr) return ''
  const ts = new Date(dateStr).getTime()
  if (!Number.isFinite(ts)) return ''

  // Clamped, not floored: a future timestamp is a clock disagreement, not a
  // negative duration, and "−1m ago" is never the right thing to show a reader.
  const diff = Math.max(0, now - ts)
  if (diff < JUST_NOW_MS) return 'just now'

  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
