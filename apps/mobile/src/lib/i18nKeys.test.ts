import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import en from '../../../../packages/shared/src/i18n/en.json'

/**
 * Every literal translation key used in the mobile app must resolve to a string.
 *
 * `t()` returns the KEY when it misses, so a missing entry compiles, renders and
 * passes review while showing the reader `library.firstBook.title`. The web app
 * had three such holes when this was written, including its entire command
 * palette.
 *
 * **Mobile and web have separate locale files** — this one checks
 * `packages/shared/src/i18n/en.json`, web's twin checks
 * `apps/web/src/locales/en.json`. A key present in one says nothing about the
 * other, and checking a source tree against the wrong file reports several
 * hundred false misses.
 *
 * Two call shapes exist: `t('a.b')` from the `useLanguage()` hook, and
 * `t(language, 'a.b')` from the shared helper. Both are matched. Keys built at
 * runtime are not, and cannot be — that limit is stated rather than papered over.
 */

const ROOTS = [resolve(__dirname, '../..', 'src'), resolve(__dirname, '../..', 'app')]
const LITERAL_T = /\bt\(\s*(?:language\s*,\s*)?'([a-zA-Z][\w.]*)'\s*[),]/g

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__mocks__') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

function resolveKey(key: string): unknown {
  return key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    en as unknown,
  )
}

describe('mobile i18n keys', () => {
  const files = ROOTS.flatMap(r => walk(r))

  it('scans a plausible number of files', () => {
    // Without this the walk could silently find nothing and the suite would
    // pass for the worst possible reason.
    expect(files.length).toBeGreaterThan(50)
  })

  it('every literal key resolves to a string', () => {
    const missing: string[] = []
    for (const file of files) {
      for (const m of readFileSync(file, 'utf8').matchAll(LITERAL_T)) {
        // An object at the path counts as missing: `t()` can only return a
        // string, so asking for a branch renders the key. Web shipped exactly
        // that — `t('highlights.empty')` where the locale held { title, … }.
        if (typeof resolveKey(m[1]) !== 'string') {
          missing.push(`${file.split('/apps/mobile/')[1]} → ${m[1]}`)
        }
      }
    }
    expect(missing).toEqual([])
  })
})
