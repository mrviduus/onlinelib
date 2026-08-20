import { test, expect } from '@playwright/test'

// @smoke — this file is the only part of the E2E suite that gates a production
// deploy. Everything here must be cheap, deterministic, and about *wiring*: did the
// page render at all, does the route resolve, is the API answering. Nothing that
// needs a fixture, a login, or a timing assumption belongs in this file.
//
// The rest of the suite runs non-blocking on PRs and nightly against production.
// Rationale in the E2E steps of .github/workflows/ci.yml.
test.describe('Smoke tests @smoke', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/TextStack/)
  })

  test('/en/books lists books', async ({ page }) => {
    await page.goto('/en/books')
    await page.waitForLoadState('networkidle')
    const content = page.locator('main, [role="main"], #root')
    await expect(content).toBeVisible()
  })

  test('/en/search returns results page', async ({ page }) => {
    await page.goto('/en/search?q=test')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).toContainText(/search|results|test/i)
  })

  test('404 page for invalid route', async ({ page }) => {
    await page.goto('/en/nonexistent-page-xyz')
    await expect(page.locator('body')).toContainText(/not found|404/i)
  })

  test('API health endpoint responds', async ({ request }) => {
    const apiURL = process.env.API_URL ?? 'http://localhost:8080'
    const resp = await request.get(`${apiURL}/health`)
    expect(resp.status()).toBe(200)
  })
})
