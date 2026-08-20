import { describe, it, expect } from 'vitest'
import { openDyslexicBase64 } from './openDyslexicBase64'

// This file is a regression test for a bug that shipped, silently, for months: the
// blob was 396 KB of base64 that decoded to a GitHub HTML page, not a font. The
// @font-face in readerHtml.ts always failed and the "Dyslexic" reader setting fell
// back to sans-serif with no error anywhere. Nothing asserted the bytes were a font,
// so nothing caught it.
describe('openDyslexicBase64', () => {
  const decoded = Buffer.from(openDyslexicBase64, 'base64')

  it('decodes to a woff2 font, not markup', () => {
    // WOFF2 files begin with the signature 'wOF2'. HTML begins with newlines or '<'.
    expect(decoded.subarray(0, 4).toString('ascii')).toBe('wOF2')
  })

  it('does not decode to an HTML document', () => {
    expect(decoded.subarray(0, 512).toString('utf8').toLowerCase()).not.toContain('<!doctype html')
  })

  it('is a plausible font size', () => {
    // Real OpenDyslexic Regular is ~115 KB. A few KB means a truncated download; a
    // few hundred KB means someone saved a web page again.
    expect(decoded.length).toBeGreaterThan(50_000)
    expect(decoded.length).toBeLessThan(250_000)
  })
})
