import { describe, it, expect } from 'vitest'
import { buildReaderHtml } from './readerHtml'

// Second argument is the theme, and its default is load-bearing — passing {}
// strips fontFamily and throws inside buildFontFace.
const html = buildReaderHtml('<p>Hello</p><img src="a.png" alt="a">')

/**
 * Every script this file emits lives inside <head>, so anything running at parse
 * time sees `document.body === null`. That cost the image lightbox: its setup
 * ended with `document.body.addEventListener(...)`, which threw on every reader
 * load and left tapping an image doing nothing — silently, on every book with
 * images, for as long as the code existed.
 *
 * A general "nothing touches document.body before <body>" rule is what you want
 * here and is not what these tests are: most body access in the head script sits
 * inside functions that run later, and telling those apart from immediate
 * statements needs a parser, not a string search. A version that tried flagged
 * `document.body.appendChild(sep)` — which is fine — on its first run. So this
 * pins the one construct that broke instead.
 */
describe('reader document', () => {
  const headEnd = html.lastIndexOf('</head>')
  const head = html.slice(0, headEnd)

  it('emits its scripts inside head, which is what makes the rest of this matter', () => {
    expect(headEnd).toBeGreaterThan(-1)
    expect(head).toContain('<script>')
  })

  it('delegates the image lightbox on document, not on a body that does not exist yet', () => {
    const start = head.indexOf('function isLightboxImg')
    expect(start).toBeGreaterThan(-1)
    const lightbox = head.slice(start)
    expect(lightbox).toContain("document.addEventListener('click'")
    expect(lightbox).not.toContain('document.body.addEventListener')
  })
})
