import { describe, it, expect } from 'vitest'
import {
  readerChromeCss,
  readerChromeInjectionJs,
  readerDocumentKey,
  latchReaderChrome,
  readerChromeChanged,
  type ReaderChrome,
} from './readerChrome'

const chrome: ReaderChrome = {
  safeArea: { top: 24, bottom: 16 },
  backgroundColor: '#FBF7F0',
  textColor: '#1A1A1A',
}

const doc = {
  chapterSlug: '1-book-i',
  fontFamily: 'Georgia',
  fontSize: 18,
  lineHeight: 1.6,
  textAlign: 'left',
  overlayV2: true,
  htmlLength: 42_000,
}

describe('readerDocumentKey', () => {
  it('ignores safe-area insets', () => {
    // The regression. Insets change every time the status bar hides, which
    // useReaderBars does 3s after open and on every scroll-direction change —
    // so the document was rebuilt many times per session with no user action,
    // discarding every chapter infinite scroll had appended.
    expect(readerDocumentKey(doc)).toBe(readerDocumentKey({ ...doc }))
  })

  it('changes when typography changes', () => {
    // Deliberately still a rebuild: these change line breaking, and the family
    // needs its @font-face inlined at build time. Re-anchoring a reading
    // position across a reflow is the position-model work, not this.
    expect(readerDocumentKey({ ...doc, fontSize: 20 })).not.toBe(readerDocumentKey(doc))
    expect(readerDocumentKey({ ...doc, lineHeight: 1.8 })).not.toBe(readerDocumentKey(doc))
    expect(readerDocumentKey({ ...doc, textAlign: 'justify' })).not.toBe(readerDocumentKey(doc))
    expect(readerDocumentKey({ ...doc, fontFamily: 'OpenDyslexic' })).not.toBe(readerDocumentKey(doc))
  })

  it('changes when the chapter changes', () => {
    expect(readerDocumentKey({ ...doc, chapterSlug: '2-book-ii' })).not.toBe(readerDocumentKey(doc))
    // Same slug, different content — an edited or re-parsed chapter.
    expect(readerDocumentKey({ ...doc, htmlLength: 43_000 })).not.toBe(readerDocumentKey(doc))
  })
})

describe('template and injection agree', () => {
  it('carry the same padding', () => {
    // 24 + 16 edge padding, 16 at the sides.
    expect(readerChromeCss(chrome)).toContain('40px 16px 32px 16px')
    expect(readerChromeInjectionJs(chrome)).toContain('40px 16px 32px 16px')
  })

  it('carry the same colours', () => {
    for (const out of [readerChromeCss(chrome), readerChromeInjectionJs(chrome)]) {
      expect(out).toContain('#FBF7F0')
      expect(out).toContain('#1A1A1A')
    }
  })

  it('produces injectable JS with no template-literal terminator', () => {
    expect(readerChromeInjectionJs(chrome)).not.toContain('`')
  })
})

describe('latchReaderChrome', () => {
  it('keeps the larger inset when the status bar hides', () => {
    expect(latchReaderChrome(chrome, { ...chrome, safeArea: { top: 0, bottom: 16 } }).safeArea.top).toBe(24)
  })

  it('lets a theme change through', () => {
    expect(latchReaderChrome(chrome, { ...chrome, backgroundColor: '#111' }).backgroundColor).toBe('#111')
  })
})

describe('readerChromeChanged', () => {
  it('is true on first application and false for an identical value', () => {
    expect(readerChromeChanged(null, chrome)).toBe(true)
    expect(readerChromeChanged(chrome, { ...chrome, safeArea: { ...chrome.safeArea } })).toBe(false)
  })
})
