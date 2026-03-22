import { test, expect } from '@playwright/test'

test.describe('Search', () => {
  test('search results render', async ({ page }) => {
    await page.goto('/en/search?q=the')
    await page.waitForLoadState('networkidle')

    // Wait for results or empty state
    const results = page.locator('.search-page__results, .search-page__empty')
    await expect(results).toBeVisible({ timeout: 10_000 })
  })

  test('search input works', async ({ page }) => {
    await page.goto('/en/search')

    const searchInput = page.locator('.search-page__input')
    await expect(searchInput).toBeVisible({ timeout: 15_000 })

    await searchInput.fill('test')
    await searchInput.press('Enter')
    await page.waitForURL(/q=test/, { timeout: 15_000 })
    expect(page.url()).toContain('q=test')
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
    await page.goto('/en/search?q=xyznonexistentqueryzzz')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('body')).toContainText(/no results/i)
  })
})
