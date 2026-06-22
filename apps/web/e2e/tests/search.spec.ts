import { test, expect } from '@playwright/test'

test.describe('Search', () => {
  test('search results render', async ({ page }) => {
    await page.goto('/en/search?q=the')
    await page.waitForLoadState('networkidle')

    // Wait for results or empty state
    const results = page.locator('.search-page__results, .empty-state')
    await expect(results).toBeVisible({ timeout: 10_000 })
  })

  test('search input works', async ({ page }) => {
    await page.goto('/en/search')

    const searchInput = page.locator('.search-page__input')
    await expect(searchInput).toBeVisible({ timeout: 15_000 })

    await searchInput.fill('test')
    // Wait for debounce (300ms) + buffer before pressing Enter
    await page.waitForTimeout(500)
    await searchInput.press('Enter')
    // URL updates via setSearchParams — wait for it
    await expect(page).toHaveURL(/q=test/, { timeout: 10_000 })
  })

  test('search result links to book', async ({ page }) => {
    await page.goto('/en/search?q=the')
    await page.waitForLoadState('networkidle')

    const resultLink = page.locator('.search-page__results a').first()
    if (await resultLink.isVisible()) {
      const href = await resultLink.getAttribute('href')
      expect(href).toMatch(/\/books\//)
    }
  })

  test('empty search shows empty state', async ({ page }) => {
    // Wait for the actual .empty-state element (Playwright auto-retries until it
    // mounts) rather than networkidle + a whole-body text match that raced the
    // SSG→CSR hydration. The empty-state only renders once the /search XHR
    // returns and `loading` flips false.
    await page.goto('/en/search?q=xyznonexistentqueryzzz')
    const emptyState = page.locator('.empty-state')
    await expect(emptyState).toBeVisible({ timeout: 20_000 })
    await expect(emptyState).toContainText(/no results/i)
  })
})
