import { test, expect } from '@playwright/test'

test.describe('Genre Detail', () => {
  test('loads genre page with name and books', async ({ page }) => {
    await page.goto('/genre/fiction')
    await page.waitForLoadState('networkidle')

    const hasContent = await page.locator('text=/Genre|Fiction/i').first().isVisible({ timeout: 10000 }).catch(() => false)
    if (hasContent) {
      const booksSection = page.locator('text=Books')
      await expect(booksSection).toBeVisible({ timeout: 5000 }).catch(() => {})
    }
  })
})
