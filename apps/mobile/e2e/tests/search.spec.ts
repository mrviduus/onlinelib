import { test, expect } from '@playwright/test'

/**
 * Discover — search and the catalog it sits on.
 *
 * Two tests were deleted rather than repaired. "search results are grouped by
 * book" and "clear button resets search" each performed some clicks and then
 * ended, with no `expect` at all — they reported green on every run including
 * ones where the feature was broken, because they never made a claim. A test
 * that cannot fail is worse than no test: it occupies the place where a real
 * one would go.
 */
test.describe('Search', () => {
  test('opens on its empty state', async ({ page }) => {
    await page.goto('/search')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=Search across all books').first()).toBeVisible({ timeout: 15000 })
  })

  test('a query resolves to results or to a stated absence of them', async ({ page }) => {
    // The point of the alternation: an offline or failed search used to render
    // as "No results for …" — a claim about the catalog rather than the
    // connection. Both branches are legitimate answers; a blank screen is not.
    await page.goto('/search')
    await page.waitForLoadState('networkidle')

    const input = page.locator('input[placeholder*="Search" i]').first()
    await input.fill('the')
    await input.press('Enter')

    await expect(
      page.locator('text=/\\d+ books?/').first()
        .or(page.locator('text=/No results|offline/i').first()),
    ).toBeVisible({ timeout: 15000 })
  })
})
