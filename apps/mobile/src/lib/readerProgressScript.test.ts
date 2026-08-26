import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Tests the progress reporter that actually ships.
 *
 * `reportProgress` lives inside the HTML string handed to the reader WebView,
 * so it cannot be imported. Rather than leave the most consequential arithmetic
 * in the app untested, this extracts the two functions from the source and runs
 * them against a fake DOM.
 *
 * The bug this locks down: infinite scroll appends chapters into the SAME
 * document, and the reporter used to send `scrollTop / documentHeight`. React
 * Native feeds that value to `computeBookProgress()` as the WITHIN-CHAPTER
 * fraction, so the moment chapter 2 was appended the book percent halved — the
 * progress bar visibly ran backwards, and the 2s debounce persisted the lower
 * value to the server. The saved scroll locator had the same flaw in pixels:
 * an absolute offset from a multi-chapter document, restored into a document
 * containing that one chapter alone, clamped to its very end.
 */

const SOURCE = readFileSync(join(__dirname, 'readerHtml.ts'), 'utf8')

function extractFunction(name: string): string {
  const start = SOURCE.indexOf(`function ${name}()`)
  if (start < 0) throw new Error(`${name} not found in readerHtml.ts — did it get renamed?`)
  let depth = 0
  let seenBrace = false
  let i = start
  for (; i < SOURCE.length; i++) {
    const c = SOURCE[i]
    if (c === '{') { depth++; seenBrace = true } else if (c === '}') {
      depth--
      if (seenBrace && depth === 0) { i++; break }
    }
  }
  return SOURCE.slice(start, i)
}

const SCRIPT = `${extractFunction('currentChapterBounds')}\n${extractFunction('reportProgress')}`

interface ProgressMessage {
  type: string
  progress: number
  chapterSlug: string | null
  scrollY: number
}

interface Scenario {
  chapters: { slug: string; top: number }[]
  scrollY: number
  innerHeight: number
  scrollHeight: number
  text?: string
}

/** Runs the extracted reporter once and returns the message it posted, if any. */
function report(s: Scenario): ProgressMessage | null {
  const sent: ProgressMessage[] = []
  const ctx: Record<string, unknown> = {
    chapterSlugs: s.chapters,
    window: {
      scrollY: s.scrollY,
      innerHeight: s.innerHeight,
      ReactNativeWebView: { postMessage: (m: string) => sent.push(JSON.parse(m)) },
    },
    document: {
      documentElement: { scrollHeight: s.scrollHeight },
      body: { innerText: s.text ?? 'a chapter with real prose in it' },
    },
    getCurrentChapterSlug: () => null,
    // The shipped script keeps this in an enclosing scope; -1 guarantees the
    // 0.005 delta gate opens so a single call always reports.
    lastProgress: -1,
    isFinite,
    Math,
    JSON,
  }
  // eslint-disable-next-line no-new-func
  new Function('ctx', `with (ctx) { ${SCRIPT}; reportProgress(); }`)(ctx)
  return sent[0] ?? null
}

const VIEWPORT = 800
const ch = (slug: string, top: number) => ({ slug, top })

describe('reader progress reporter — single chapter loaded', () => {
  it('reports 0 at the top and 1 at the bottom', () => {
    expect(report({ chapters: [ch('one', 0)], scrollY: 0, innerHeight: VIEWPORT, scrollHeight: 3000 }))
      .toMatchObject({ progress: 0, chapterSlug: 'one', scrollY: 0 })
    expect(report({ chapters: [ch('one', 0)], scrollY: 2200, innerHeight: VIEWPORT, scrollHeight: 3000 }))
      .toMatchObject({ progress: 1, chapterSlug: 'one' })
  })

  it('treats a chapter shorter than the viewport as read', () => {
    expect(report({ chapters: [ch('one', 0)], scrollY: 0, innerHeight: VIEWPORT, scrollHeight: VIEWPORT }))
      .toMatchObject({ progress: 1 })
  })

  it('reports nothing at all for an empty chapter', () => {
    // Restoring a saved position calls scrollTo, which fires this listener. A
    // blank chapter would otherwise bank 100% into the book-wide percent
    // without the user reading a word.
    expect(report({
      chapters: [ch('one', 0)], scrollY: 0, innerHeight: VIEWPORT, scrollHeight: VIEWPORT, text: '   \n  ',
    })).toBeNull()
  })
})

describe('reader progress reporter — infinite scroll has appended chapter two', () => {
  // Document is now 6000px; chapter two begins at 3000.
  const twoLoaded = [ch('one', 0), ch('two', 3000)]

  it('still reports 1 at the end of chapter one — the book percent must not run backwards', () => {
    // This is the regression. Document-wide, 2200/5200 ≈ 0.42 would be sent
    // labelled "chapter one", halving the book percent and persisting it.
    const msg = report({ chapters: twoLoaded, scrollY: 2200, innerHeight: VIEWPORT, scrollHeight: 6000 })
    expect(msg).toMatchObject({ progress: 1, chapterSlug: 'one' })
  })

  it('reports 0 at the start of chapter two, not the document fraction', () => {
    const msg = report({ chapters: twoLoaded, scrollY: 3000, innerHeight: VIEWPORT, scrollHeight: 6000 })
    expect(msg).toMatchObject({ progress: 0, chapterSlug: 'two' })
  })

  it('reports a chapter-relative scroll offset, so resume lands where the reader stopped', () => {
    // Absolute 3000 would be restored into a document holding chapter two
    // alone (~2200px scrollable) and clamp to its very end.
    const msg = report({ chapters: twoLoaded, scrollY: 3000, innerHeight: VIEWPORT, scrollHeight: 6000 })
    expect(msg?.scrollY).toBe(0)
  })

  it('reaches 1 at the end of the last loaded chapter', () => {
    expect(report({ chapters: twoLoaded, scrollY: 5200, innerHeight: VIEWPORT, scrollHeight: 6000 }))
      .toMatchObject({ progress: 1, chapterSlug: 'two' })
  })

  it('never reports a percent outside 0..1 across the whole document', () => {
    for (let y = 0; y <= 5200; y += 100) {
      const msg = report({ chapters: twoLoaded, scrollY: y, innerHeight: VIEWPORT, scrollHeight: 6000 })
      if (!msg) continue
      expect(msg.progress).toBeGreaterThanOrEqual(0)
      expect(msg.progress).toBeLessThanOrEqual(1)
      expect(msg.scrollY).toBeGreaterThanOrEqual(0)
    }
  })

  it('is monotonic within a chapter as the reader scrolls forward', () => {
    let prev = -1
    for (let y = 0; y <= 2200; y += 100) {
      const msg = report({ chapters: twoLoaded, scrollY: y, innerHeight: VIEWPORT, scrollHeight: 6000 })!
      expect(msg.progress).toBeGreaterThanOrEqual(prev)
      prev = msg.progress
    }
  })
})
