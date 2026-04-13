import { test, expect } from '@playwright/test'

// Regression guard: on SEO landing pages + homepage, a clean anonymous visit
// must NOT trigger POST /auth/guest. Bootstrap is read-only by design
// (AuthContext.tsx:I1) and guest creation is demand-driven (ensureSession on
// commitment signals — file upload, vocabulary tap threshold). If someone
// accidentally wires ensureSession into a useEffect / hover / prefetch, this
// test fails — preventing bot traffic from creating DB rows on SSG pages.

const URLS = [
  '/en/learn-english-brazil',
  '/en/learn-english-spain',
  '/en',
]

test.describe('guest creation guard', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  for (const url of URLS) {
    test(`${url} does not trigger POST /auth/guest on mount`, async ({ page }) => {
      const guestCalls: string[] = []
      page.on('request', (req) => {
        if (req.url().includes('/auth/guest') && req.method() === 'POST') {
          guestCalls.push(req.url())
        }
      })

      await page.goto(url)
      await page.waitForLoadState('networkidle')

      expect(guestCalls, `Unexpected POST /auth/guest calls on ${url}: ${guestCalls.join(', ')}`).toHaveLength(0)
    })
  }
})
