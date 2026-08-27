/**
 * A count and its noun, agreeing.
 *
 * QA read "1 words added · 1 words reviewed" on the stats screen. The app had no way to write it
 * correctly: `t(lang, key)` takes a key and nothing else — no parameters, no plural forms — so a
 * count can never reach a translated string. What existed instead were five hand-rolled ternaries in
 * five files, and thirteen places that just hardcoded the plural and hoped the number stayed above
 * one.
 *
 * This is not ICU and does not pretend to be: it handles English one-vs-many, which is the whole of
 * what the app currently ships. Real plural categories arrive with `t()` parameters, recorded in
 * docs/STATUS.md as the larger change this defers.
 */
export function plural(
  n: number,
  one: string,
  many: string,
  template = '{n} {noun}',
): string {
  return template
    .replace('{n}', String(n))
    .replace('{noun}', n === 1 ? one : many)
}
