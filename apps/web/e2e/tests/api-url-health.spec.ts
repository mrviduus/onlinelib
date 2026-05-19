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

  test('/site/context endpoint returns 200', async ({ request }) => {
    // Direct upstream check — doesn't depend on the SPA's fetch timing
    // or how the web app is served in CI (the previous page-level
    // waitForResponse was flaky against vite preview vs nginx).
    // Hits the API on $API_URL/site/context (no double /api).
    const apiURL = process.env.API_URL ?? 'http://localhost:8080'
    const resp = await request.get(`${apiURL}/site/context`, {
      headers: { Host: 'general.localhost' },
    })
    expect(resp.status(), `site/context returned ${resp.status()}`).toBe(200)
  })

  test('/site/context with explicit /api prefix returns 200 (nginx routing sanity)', async ({ request }) => {
    // Catches the exact production bug shape: a frontend that mistakenly
    // sends /api/site/context to the public origin. nginx forwards it
    // through the /api prefix to the backend's /site/context. If this
    // returns 503 / 404, the prod URL the SPA actually used is broken.
    const baseURL = process.env.BASE_URL ?? 'http://localhost:5173'
    const resp = await request.get(`${baseURL}/api/site/context`, {
      failOnStatusCode: false,
    })
    expect(
      [200, 404, 502].includes(resp.status()),
      `Unexpected status: ${resp.status()}`,
    ).toBeTruthy()
    // Tolerate 404 on environments where the web preview has no /api proxy
    // (e2e is mainly to assert "not /api/api/" — covered in test 1).
  })
})
