import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// JSON.parse silently keeps the LAST duplicate key — silently shadowing earlier
// translations. We hit this in PR #191 → #192 (vocabulary.practice block had
// title/cta/subtitle on one line and mode/length/blitz on another → cta lost).
//
// This walks the source text and reports any key declared twice in the same
// object scope. Pure string scan, no parser dep.
function findDuplicateKeys(jsonText: string): string[] {
  const dups: string[] = []
  const stack: { keys: Set<string>; path: string }[] = [{ keys: new Set(), path: '$' }]
  let i = 0
  let inString = false
  let escape = false
  let stringStart = -1

  while (i < jsonText.length) {
    const c = jsonText[i]

    if (inString) {
      if (escape) {
        escape = false
      } else if (c === '\\') {
        escape = true
      } else if (c === '"') {
        // String just ended at index i. Check if this is a key (next non-space is ':').
        const value = jsonText.slice(stringStart + 1, i)
        let j = i + 1
        while (j < jsonText.length && /\s/.test(jsonText[j])) j++
        if (jsonText[j] === ':') {
          const scope = stack[stack.length - 1]
          if (scope.keys.has(value)) {
            dups.push(`${scope.path}.${value}`)
          } else {
            scope.keys.add(value)
          }
        }
        inString = false
      }
      i++
      continue
    }

    if (c === '"') {
      inString = true
      stringStart = i
      i++
      continue
    }

    if (c === '{') {
      stack.push({ keys: new Set(), path: stack[stack.length - 1]?.path + '.{}' })
    } else if (c === '}') {
      stack.pop()
    }

    i++
  }

  return dups
}

const cases = [
  { name: 'apps/web/src/locales/en.json', path: resolve(__dirname, '../en.json') },
  {
    name: 'packages/shared/src/i18n/en.json',
    path: resolve(__dirname, '../../../../../packages/shared/src/i18n/en.json'),
  },
]

describe('i18n source files have no duplicate keys', () => {
  for (const { name, path } of cases) {
    it(name, () => {
      const text = readFileSync(path, 'utf8')
      const dups = findDuplicateKeys(text)
      expect(dups).toEqual([])
    })
  }

  it('detector catches a duplicate', () => {
    const dups = findDuplicateKeys('{ "a": 1, "b": { "x": 1, "x": 2 } }')
    expect(dups.length).toBe(1)
    expect(dups[0]).toContain('x')
  })

  it('detector ignores same key in different scopes', () => {
    const dups = findDuplicateKeys('{ "a": { "x": 1 }, "b": { "x": 2 } }')
    expect(dups).toEqual([])
  })

  it('detector ignores key strings inside string values', () => {
    const dups = findDuplicateKeys('{ "msg": "key: value", "other": 1 }')
    expect(dups).toEqual([])
  })
})
