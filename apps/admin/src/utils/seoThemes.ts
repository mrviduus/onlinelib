/**
 * Defensive parse of the `SeoThemesJson` DB column.
 *
 * Historically a `string[]`, but SEO backfill and older imports wrote
 * `Array<{ theme, description }>` for some rows. Both Edition and Author
 * editors map themes straight into a string-tag input — rendering the
 * object form crashes React with "Objects are not valid as a React child".
 *
 * Coerce any non-string element to its `theme` field (preferred) or to
 * `String(item)` as a last resort, so the editor opens and the user can
 * fix the data in place. Safe to remove once the DB is normalized.
 */
export function parseSeoThemes(raw: string | null | undefined): string[] {
  if (!raw) return []
  let arr: unknown
  try { arr = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(arr)) return []
  return arr.map(item => {
    if (typeof item === 'string') return item
    if (item && typeof item === 'object' && 'theme' in item && typeof (item as { theme: unknown }).theme === 'string') {
      return (item as { theme: string }).theme
    }
    return String(item ?? '')
  }).filter(Boolean)
}
