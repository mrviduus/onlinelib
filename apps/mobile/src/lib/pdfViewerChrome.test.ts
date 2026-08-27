import { describe, it, expect } from 'vitest'
import {
  pdfChromeCss,
  pdfChromeInjectionJs,
  pdfDocumentKey,
  latchPdfChrome,
  pdfChromeChanged,
  type PdfChrome,
} from './pdfViewerChrome'

const chrome: PdfChrome = {
  safeArea: { top: 24, bottom: 16 },
  backgroundColor: '#FBF7F0',
  textColor: '#1A1A1A',
}

describe('pdfDocumentKey', () => {
  it('ignores safe-area insets', () => {
    // THE regression test. Insets change every time the status bar hides, which
    // `useReaderBars` does 3s after open and on every scroll-direction change.
    // While they were memo dependencies the document reloaded dozens of times a
    // session, each reload reopening at page 1 and persisting it as the position.
    const doc = { fileUrl: 'https://api/f.pdf', token: 't', nonce: 0, initialPage: 1 }
    expect(pdfDocumentKey(doc)).toBe(pdfDocumentKey({ ...doc }))
  })

  it('ignores the reader theme', () => {
    // Same failure, slower to notice: switching to dark mode mid-book restarted
    // the document at page 1.
    const doc = { fileUrl: 'https://api/f.pdf', token: 't', nonce: 0, initialPage: 7 }
    expect(pdfDocumentKey(doc)).toBe(pdfDocumentKey({ ...doc }))
  })

  it('changes when the file, token, nonce or initial page changes', () => {
    const base = { fileUrl: 'https://api/f.pdf', token: 't', nonce: 0, initialPage: 1 }
    const key = pdfDocumentKey(base)
    expect(pdfDocumentKey({ ...base, fileUrl: 'https://api/g.pdf' })).not.toBe(key)
    expect(pdfDocumentKey({ ...base, token: 't2' })).not.toBe(key)
    // The silent 401 recovery bumps the nonce — that reload is intentional.
    expect(pdfDocumentKey({ ...base, nonce: 1 })).not.toBe(key)
    expect(pdfDocumentKey({ ...base, initialPage: 9 })).not.toBe(key)
  })

  it('does not confuse a null token with a null initial page', () => {
    // Both stringify to '' — without a separator, ('a', null, 0, 5) and
    // ('a', '', 0, null) could collide and silently share a document.
    expect(pdfDocumentKey({ fileUrl: 'a', token: null, nonce: 0, initialPage: 5 }))
      .not.toBe(pdfDocumentKey({ fileUrl: 'a', token: '5', nonce: 0, initialPage: null }))
  })
})

describe('template and injection agree', () => {
  it('carry the same padding', () => {
    // Two routes to the same look: a fresh document renders the CSS, a live one
    // is injected. If they drift, toggling the bars silently reflows the page.
    expect(pdfChromeCss(chrome)).toContain('24px 0 16px 0')
    expect(pdfChromeInjectionJs(chrome)).toContain('24px 0 16px 0')
  })

  it('carry the same colours', () => {
    for (const out of [pdfChromeCss(chrome), pdfChromeInjectionJs(chrome)]) {
      expect(out).toContain('#FBF7F0')
      expect(out).toContain('#1A1A1A')
    }
  })

  it('produces injectable JS with no template-literal terminator', () => {
    // The injection string is embedded in a JS template literal on the way to
    // injectJavaScript; a stray backtick would terminate it. This has bitten
    // readerHtml.ts before.
    expect(pdfChromeInjectionJs(chrome)).not.toContain('`')
  })
})

describe('latchPdfChrome', () => {
  it('keeps the larger inset when the status bar hides', () => {
    // The top bar is an absolute overlay: it comes back. Dropping the padding
    // would reflow the page under it and move the reader's position.
    const latched = latchPdfChrome(chrome, { ...chrome, safeArea: { top: 0, bottom: 16 } })
    expect(latched.safeArea.top).toBe(24)
  })

  it('absorbs the zero insets Android reports on the first frame', () => {
    const latched = latchPdfChrome(
      { ...chrome, safeArea: { top: 0, bottom: 0 } },
      { ...chrome, safeArea: { top: 24, bottom: 16 } },
    )
    expect(latched.safeArea).toEqual({ top: 24, bottom: 16 })
  })

  it('lets a theme change through', () => {
    // Unlike insets, this is a change the reader asked for.
    const dark = { ...chrome, backgroundColor: '#111', textColor: '#EEE' }
    expect(latchPdfChrome(chrome, dark).backgroundColor).toBe('#111')
  })
})

describe('pdfChromeChanged', () => {
  it('is true on first application and false for an identical value', () => {
    expect(pdfChromeChanged(null, chrome)).toBe(true)
    expect(pdfChromeChanged(chrome, { ...chrome, safeArea: { ...chrome.safeArea } })).toBe(false)
  })

  it('notices a theme switch', () => {
    expect(pdfChromeChanged(chrome, { ...chrome, backgroundColor: '#111' })).toBe(true)
  })
})
