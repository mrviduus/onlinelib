import { test, expect } from '@playwright/test'

/**
 * API-URL hygiene smoke tests.
 *
 * Catches regressions where a frontend caller appends an extra "/api/"
 * to a URL whose base already ends in "/api" (VITE_API_URL=/api on
 * prod). Symptom: nginx returns 503 for /api/api/<route>; the affected
 * provider silently falls into its error branch; Ahrefs Site Audit
 * flags "Page has broken JavaScript" across every SSG'd page.
 *
 * History: the double-prefix bug shipped on 2025-12-18 in SiteContext
 * and on 2026-02-04 in api/translation.ts. It went unnoticed for
 * ~4.5 months because real-user SPAs degraded silently and bots got
 * pre-rendered HTML. Discovered via Chrome DevTools after Ahrefs
 * flagged it externally.
 */
test.describe('API URL hygiene', () => {
  test('no /api/api/ duplicate-prefix requests on book detail page', async ({ page }) => {
    const offenders: string[] = []
    page.on('request', req => {
      if (/\/api\/api\//.test(req.url())) offenders.push(req.url())
    })

    await page.goto('/en/books/dracula/')
    await page.waitForLoadState('networkidle')

    expect(offenders, `Found double /api/ prefix in: ${offenders.join(', ')}`).toEqual([])
  })

  test('no 5xx on any /api/ request during book detail page load', async ({ page }) => {
    const failures: { url: string; status: number }[] = []
    page.on('response', res => {
      const url = res.url()
      if (!/\/api\//.test(url)) return
      const status = res.status()
      // 4xx may be legitimate (e.g. /me/* without a session) — only fail on 5xx.
      if (status >= 500) failures.push({ url, status })
    })

    await page.goto('/en/books/dracula/')
    await page.waitForLoadState('networkidle')

    expect(
      failures,
      `5xx on /api/ during page load:\n${failures.map(f => `  ${f.status} ${f.url}`).join('\n')}`,
    ).toEqual([])
  })

  test('SiteContext loads (provider boots without falling into error state)', async ({ page }) => {
    // The provider fetches /api/site/context on mount; a 503 silently
    // resolves the error branch and the rest of the app degrades. We
    // assert the call succeeds — that's the upstream contract.
    const responsePromise = page.waitForResponse(
      res => /\/api\/site\/context\b/.test(res.url()) && !/\/api\/api\//.test(res.url()),
      { timeout: 15_000 },
    )
    await page.goto('/en/books/dracula/')
    const res = await responsePromise
    expect(res.status(), `site/context returned ${res.status()}`).toBe(200)
  })
})
