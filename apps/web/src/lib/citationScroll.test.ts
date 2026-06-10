import { describe, it, expect, afterEach } from 'vitest'
import { makeSnippet, proportionalTop, findCitationRange } from './citationScroll'

describe('makeSnippet', () => {
  it('returns the whole string when short enough (and collapses whitespace)', () => {
    expect(makeSnippet('  the   quick brown  ')).toBe('the quick brown')
  })

  it('cuts a long preview at a word boundary', () => {
    const s = makeSnippet('Replication keeps a copy of the same data on multiple machines for fault tolerance')
    expect(s.length).toBeLessThanOrEqual(40)
    expect(s).not.toMatch(/\s$/)
    expect('Replication keeps a copy of the same data on multiple machines for fault tolerance').toContain(s)
  })

  it('returns empty for too-short input', () => {
    expect(makeSnippet('short')).toBe('')
    expect(makeSnippet('   ')).toBe('')
  })
})

describe('proportionalTop', () => {
  it('clamps the fraction to [0,1] and centers in the viewport', () => {
    // frac = 50/100 = 0.5 → 0 + 1000*0.5 - 600/2 = 200
    expect(proportionalTop(50, 100, 0, 1000, 600)).toBe(200)
  })

  it('clamps an over-range offset and never goes negative', () => {
    expect(proportionalTop(999, 100, 0, 1000, 600)).toBe(700) // frac clamped to 1
    expect(proportionalTop(0, 100, 0, 200, 600)).toBe(0) // would be -300 → clamped to 0
  })
})

describe('findCitationRange', () => {
  let container: HTMLElement

  afterEach(() => container?.remove())

  it('returns a Range for a snippet present in the DOM', () => {
    container = document.createElement('div')
    container.innerHTML = '<p>The replication strategy keeps copies on many machines.</p>'
    document.body.appendChild(container)

    const range = findCitationRange(container, 'replication strategy')
    expect(range).not.toBeNull()
    expect(range!.toString().toLowerCase()).toContain('replication strategy')
  })

  it('returns null when the snippet is absent or empty', () => {
    container = document.createElement('div')
    container.innerHTML = '<p>Nothing relevant here.</p>'
    document.body.appendChild(container)

    expect(findCitationRange(container, 'replication strategy')).toBeNull()
    expect(findCitationRange(container, '')).toBeNull()
  })
})
