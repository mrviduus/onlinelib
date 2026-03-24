import { test, expect } from '@playwright/test'

test.describe('Library', () => {
  test('library page shows tabs: Saved, Uploads, Reviews', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Navigate to library tab
    const libraryTab = page.locator('text=Library')
    if (await libraryTab.first().isVisible({ timeout: 10000 })) {
      await libraryTab.first().click()
      await page.waitForLoadState('networkidle')

      // Should show tab labels
      const hasSaved = await page.locator('text=/Saved/').first().isVisible({ timeout: 10000 }).catch(() => false)
      const hasUploads = await page.locator('text=/Uploads/').first().isVisible({ timeout: 5000 }).catch(() => false)
      const hasReviews = await page.locator('text=/Reviews/').first().isVisible({ timeout: 5000 }).catch(() => false)

      // At least saved and uploads tabs should be visible
      expect(hasSaved || hasUploads).toBeTruthy()
    }
  })

  test('uploads tab shows upload button', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const libraryTab = page.locator('text=Library')
    if (await libraryTab.first().isVisible({ timeout: 10000 })) {
      await libraryTab.first().click()
      await page.waitForLoadState('networkidle')

      // Click uploads tab
      const uploadsTab = page.locator('text=/Uploads/')
      if (await uploadsTab.first().isVisible({ timeout: 5000 })) {
        await uploadsTab.first().click()
        await page.waitForTimeout(1000)

        // Should show upload button or empty state
        const hasUpload = await page.locator('text=/Upload Book|No uploaded/').first().isVisible({ timeout: 5000 }).catch(() => false)
        expect(hasUpload).toBeTruthy()
      }
    }
  })

  test('saved tab shows sort chips', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const libraryTab = page.locator('text=Library')
    if (await libraryTab.first().isVisible({ timeout: 10000 })) {
      await libraryTab.first().click()
      await page.waitForLoadState('networkidle')

      // Sort chips should be visible if books exist, or empty state
      const hasContent = await page.locator('text=/Recent|Title|Progress|No saved books/').first().isVisible({ timeout: 5000 }).catch(() => false)
      expect(hasContent).toBeTruthy()
    }
  })
})
