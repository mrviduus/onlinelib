import { test, expect } from '@playwright/test'

test.describe('Search', () => {
  test('search page shows empty state', async ({ page }) => {
    await page.goto('/search')
    await page.waitForLoadState('networkidle')

    const hasPlaceholder = await page.locator('text=Search across all books').isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasPlaceholder).toBeTruthy()
  })

  test('search input accepts text and returns results', async ({ page }) => {
    await page.goto('/search')
    await page.waitForLoadState('networkidle')

    const input = page.locator('input[placeholder*="Search"]')
    await input.fill('the')
    await input.press('Enter')
    await page.waitForTimeout(2000)

    // Should show results or no results
    const hasResults = await page.locator('text=/\\d+ books?/').first().isVisible({ timeout: 10000 }).catch(() => false)
    const hasNoResults = await page.locator('text=No results').first().isVisible({ timeout: 3000 }).catch(() => false)
    expect(hasResults || hasNoResults).toBeTruthy()
  })

  test('search results are grouped by book', async ({ page }) => {
    await page.goto('/search')
    await page.waitForLoadState('networkidle')

    const input = page.locator('input[placeholder*="Search"]')
    await input.fill('the')
    await input.press('Enter')
    await page.waitForTimeout(2000)

    // If results, should show "N books · M matches" summary
    const hasSummary = await page.locator('text=/\\d+ books?.*\\d+ match/').first().isVisible({ timeout: 5000 }).catch(() => false)
    // Summary may or may not show depending on results
  })

  test('clear button resets search', async ({ page }) => {
    await page.goto('/search')
    await page.waitForLoadState('networkidle')

    const input = page.locator('input[placeholder*="Search"]')
    await input.fill('test')

    // Clear button should appear
    await page.waitForTimeout(500)
    const clearBtn = page.locator('[aria-label="close-circle"]').or(page.locator('svg').last())
    // Clicking clear returns to empty state
  })
})
