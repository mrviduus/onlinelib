import { describe, it, expect, afterEach } from 'vitest'
import { proportionalTop, findCitationRange } from './citationScroll'
// makeSnippet now lives in @textstack/shared (used by web + mobile); tested there.

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

  it('skips matches inside reader decorations (vocab glosses)', () => {
    container = document.createElement('div')
    container.innerHTML =
      '<p>Intro. <span class="vocab-inline-translation">replication strategy</span> ' +
      'and then the real replication strategy in the prose.</p>'
    document.body.appendChild(container)

    const range = findCitationRange(container, 'replication strategy')
    expect(range).not.toBeNull()
    // The returned match must NOT be the one inside the gloss span.
    let el: Element | null = range!.startContainer.parentElement
    let insideGloss = false
    while (el) {
      if (el.classList?.contains('vocab-inline-translation')) insideGloss = true
      el = el.parentElement
    }
    expect(insideGloss).toBe(false)
  })
})
