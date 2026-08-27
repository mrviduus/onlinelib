// @vitest-environment jsdom
//
// Smoke-test for the mobile WebView bundle. Loads the auto-generated
// IIFE into JSDOM, then exercises the runtime surface readerHtml.ts uses.
//
// Goal: catch a generated bundle that fails to install __TSOverlayer or
// that exposes a different shape than the mobile injected JS expects.
// Doesn't replace device verification but blocks PRs that ship a broken
// regenerate.
//
// Lived in apps/web until 2026-08-19, importing across the app boundary via
// ../../../mobile/. That worked locally and broke the moment web's suite was wired
// into CI: resolving a .ts file under apps/mobile makes Vite parse
// apps/mobile/tsconfig.json, which extends expo/tsconfig.base — a module the web job
// never installs. The test belongs next to the artifact it checks.
import { describe, it, expect, beforeEach } from 'vitest'
import { READER_OVERLAY_SCRIPT } from './readerOverlayScript.generated'

// Lookup helper. The mobileBootstrap module declares the canonical shape on
// window.__TSOverlayer; we shape-test from that global without duplicating
// the type declaration (which would clash on import-merge).
function getOv(): {
  create: () => {
    element: SVGSVGElement
    add: (key: string, range: Range, draw: unknown, options?: unknown) => void
    remove: (key: string) => void
    clear: () => void
    redraw: () => void
    syncScroll: () => void
    hitTest: (point: { x: number; y: number }) => [string, Range] | []
    size: () => number
    markJustAnchored: (ms?: number) => void
    isJustAnchored: () => boolean
  }
  highlight: unknown
  underline: unknown
  outline: unknown
  strikethrough: unknown
  squiggly: unknown
  pulse: unknown
} {
  return (window as unknown as { __TSOverlayer: ReturnType<typeof getOv> }).__TSOverlayer
}

function evalBundle(): void {
  // The bundle's IIFE installs window.__TSOverlayer when run in a browser
  // context. JSDOM provides one. eval is safe — bundle is auto-generated.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function(READER_OVERLAY_SCRIPT)()
}

describe('mobile overlay bundle', () => {
  beforeEach(() => {
    delete (window as { __TSOverlayer?: unknown }).__TSOverlayer
    document.body.innerHTML = ''
  })

  it('installs window.__TSOverlayer with the expected surface', () => {
    evalBundle()
    const ov = getOv()
    expect(ov).toBeDefined()
    expect(typeof ov!.create).toBe('function')
    expect(typeof ov!.highlight).toBe('function')
    expect(typeof ov!.underline).toBe('function')
    expect(typeof ov!.outline).toBe('function')
    expect(typeof ov!.strikethrough).toBe('function')
    expect(typeof ov!.squiggly).toBe('function')
    expect(typeof ov!.pulse).toBe('function')
  })

  it('does not double-install if the bundle is loaded twice', () => {
    evalBundle()
    const first = getOv()
    evalBundle()
    expect(getOv()).toBe(first)
  })

  it('exposes a factory that returns the functional API readerHtml.ts uses', () => {
    evalBundle()
    const inst = getOv()!.create()
    for (const m of [
      'add',
      'remove',
      'clear',
      'redraw',
      'syncScroll',
      'hitTest',
      'size',
      'markJustAnchored',
      'isJustAnchored',
    ] as const) {
      expect(typeof inst[m]).toBe('function')
    }
    expect(inst.element.namespaceURI).toBe('http://www.w3.org/2000/svg')
  })

  it('add → remove round-trips and updates size()', () => {
    evalBundle()
    const inst = getOv()!.create()
    document.body.appendChild(inst.element)

    const p = document.createElement('p')
    p.textContent = 'hello world'
    document.body.appendChild(p)
    const range = document.createRange()
    range.selectNodeContents(p)
    // JSDOM doesn't implement getClientRects — stub it so captureRects can run.
    Object.defineProperty(range, 'getClientRects', {
      configurable: true,
      value: () => ({
        length: 1,
        item: () => null,
        [Symbol.iterator]: function* () {
          yield {
            x: 0, y: 0, left: 0, top: 0, right: 50, bottom: 14, width: 50, height: 14,
            toJSON: () => ({}),
          } as DOMRect
        },
      } as unknown as DOMRectList),
    })

    expect(inst.size()).toBe(0)
    inst.add('user-hl:1', range, getOv()!.highlight, { color: 'yellow' })
    expect(inst.size()).toBe(1)
    inst.remove('user-hl:1')
    expect(inst.size()).toBe(0)
  })

  it('markJustAnchored opens a cooldown observable via isJustAnchored', () => {
    evalBundle()
    const inst = getOv()!.create()
    expect(inst.isJustAnchored()).toBe(false)
    inst.markJustAnchored(1000)
    expect(inst.isJustAnchored()).toBe(true)
  })
})

/**
 * The WebView cannot import modules, so this bundle is the only way a shared
 * function reaches the reader. `readerHtml.ts` used to carry its own anchor
 * resolver — the same idea with integer scoring instead of Dice similarity, and
 * with neither the offset verification nor the fuzzy fallback — so a highlight
 * that survived a book edit on the web silently vanished on the phone.
 *
 * These assert the shared matcher actually arrived, not merely that it compiles.
 */
describe('__TSAnchor — shared text-anchor resolution in the bundle', () => {
  const getAnchor = () => (window as unknown as {
    __TSAnchor?: { findOffset: (text: string, a: unknown) => number | null }
  }).__TSAnchor

  const anchor = (o: Record<string, unknown>) => ({
    prefix: '', suffix: '', startOffset: -1, endOffset: -1, ...o,
  })

  it('installs findOffset on the window', () => {
    evalBundle()
    expect(typeof getAnchor()?.findOffset).toBe('function')
  })

  it('resolves a passage by its surrounding context', () => {
    evalBundle()
    const text = 'Call me Ishmael. Some years ago, having little money.'
    expect(getAnchor()!.findOffset(text, anchor({ prefix: 'Call me ', exact: 'Ishmael', suffix: '. Some' })))
      .toBe(text.indexOf('Ishmael'))
  })

  it('picks the right occurrence when the passage repeats', () => {
    // The capability the mobile-only resolver approximated with integer scores.
    evalBundle()
    const text = 'the sea was calm. Far beneath the sea lay silence. Above the sea, gulls.'
    const at = getAnchor()!.findOffset(text, anchor({
      prefix: 'Far beneath ', exact: 'the sea', suffix: ' lay silence',
    }))
    expect(at).toBe(text.indexOf('Far beneath the sea') + 'Far beneath '.length)
  })

  it('finds a passage the document has since drifted, which the old resolver could not', () => {
    // No exact context hit and the stored offsets are stale — this needed the
    // fuzzy fallback that only web had.
    evalBundle()
    const text = 'Some years ago, having little or no moeny in my purse, I thought I would sail.'
    expect(getAnchor()!.findOffset(text, anchor({ exact: 'having little or no money in my purse' })))
      .toBe(text.indexOf('having little'))
  })

  it('returns null rather than guessing when the passage is gone', () => {
    evalBundle()
    expect(getAnchor()!.findOffset('completely unrelated prose', anchor({ exact: 'Ishmael' }))).toBeNull()
  })
})
