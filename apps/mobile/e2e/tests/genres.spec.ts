import { test, expect } from '@playwright/test'

test.describe('Genres', () => {
  test('genres page loads', async ({ page }) => {
    await page.goto('/genres')
    await page.waitForLoadState('networkidle')

    const hasGenres = await page.locator('text=Genres').first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasGenres).toBeTruthy()
  })

  test('genre cards or empty state visible', async ({ page }) => {
    await page.goto('/genres')
    await page.waitForLoadState('networkidle')

    // Either genre names or empty state
    const hasContent = await page.locator('text=/\\d+ books?|No genres found/').first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasContent).toBeTruthy()
  })
})
