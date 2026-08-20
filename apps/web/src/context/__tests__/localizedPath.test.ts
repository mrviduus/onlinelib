import { describe, it, expect } from 'vitest'
import { buildLocalizedPath } from '../LanguageContext'

// CookieBanner renders as a sibling of the routes — it has to appear on `/` too, and
// LanguageProvider only exists inside `/:lang/*`. So it read the default context,
// whose getLocalizedPath was the identity function, and its "Privacy Policy" link
// pointed at `/privacy` while every other link on the same page pointed at
// `/en/privacy/`. A consent banner is precisely where that link must work.
describe('buildLocalizedPath', () => {
  it('prefixes the language and adds a trailing slash', () => {
    expect(buildLocalizedPath('/privacy', 'en')).toBe('/en/privacy/')
    expect(buildLocalizedPath('/books', 'en')).toBe('/en/books/')
  })

  it('does not double-prefix an already-localized path', () => {
    expect(buildLocalizedPath('/en/privacy', 'en')).toBe('/en/privacy/')
    expect(buildLocalizedPath('/en/privacy/', 'en')).toBe('/en/privacy/')
  })

  it('keeps the query string after the trailing slash', () => {
    expect(buildLocalizedPath('/search?q=dracula', 'en')).toBe('/en/search/?q=dracula')
    expect(buildLocalizedPath('/en/search?q=x', 'en')).toBe('/en/search/?q=x')
  })

  it('tolerates a path without a leading slash', () => {
    expect(buildLocalizedPath('privacy', 'en')).toBe('/en/privacy/')
  })
})
