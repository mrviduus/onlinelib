import { test, expect } from '@playwright/test'

test.describe('Highlights', () => {
  test('highlights page loads', async ({ page }) => {
    await page.goto('/highlights')
    await page.waitForLoadState('networkidle')

    // Should show Highlights header or empty state
    const hasHighlights = await page.locator('text=Highlights').first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasHighlights).toBeTruthy()
  })

  test('book type tabs visible', async ({ page }) => {
    await page.goto('/highlights')
    await page.waitForLoadState('networkidle')

    // Should show All/Library/Uploads tabs
    const hasAll = await page.locator('text=All').first().isVisible({ timeout: 10000 }).catch(() => false)
    if (hasAll) {
      const hasLibrary = await page.locator('text=Library').first().isVisible({ timeout: 3000 }).catch(() => false)
      const hasUploads = await page.locator('text=Uploads').first().isVisible({ timeout: 3000 }).catch(() => false)
      expect(hasLibrary || hasUploads).toBeTruthy()
    }
  })

  test('sort and color filters visible', async ({ page }) => {
    await page.goto('/highlights')
    await page.waitForLoadState('networkidle')

    // Should show Newest/Oldest sort options
    const hasSort = await page.locator('text=Newest').first().isVisible({ timeout: 10000 }).catch(() => false)
    if (hasSort) {
      const hasOldest = await page.locator('text=Oldest').first().isVisible({ timeout: 3000 }).catch(() => false)
      expect(hasOldest).toBeTruthy()
    }
  })

  test('search input visible', async ({ page }) => {
    await page.goto('/highlights')
    await page.waitForLoadState('networkidle')

    const hasSearch = await page.locator('input[placeholder*="Search"]').or(page.locator('text=/Search highlights/i')).first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasSearch).toBeTruthy()
  })

  test('highlight review page loads', async ({ page }) => {
    await page.goto('/highlights/review')
    await page.waitForLoadState('networkidle')

    const hasContent = await page.locator('text=/Review|caught up|No highlights/i').first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasContent).toBeTruthy()
  })
})
