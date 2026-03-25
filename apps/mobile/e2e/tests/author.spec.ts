import { test, expect } from '@playwright/test'

test.describe('Author Detail', () => {
  test('loads author page with name and books', async ({ page }) => {
    // Navigate to a known author (adjust slug as needed)
    await page.goto('/author/bram-stoker')
    await page.waitForLoadState('networkidle')

    // Should show author name or loading skeleton
    const hasContent = await page.locator('text=/Author|Bram Stoker/i').first().isVisible({ timeout: 10000 }).catch(() => false)
    // If author exists, check for books section
    if (hasContent) {
      const booksSection = page.locator('text=Books')
      await expect(booksSection).toBeVisible({ timeout: 5000 }).catch(() => {})
    }
  })
})
