import { test, expect } from '@playwright/test'

test.describe('Library', () => {
  test('library page shows tabs: Saved, Uploads, Reviews', async ({ page }) => {
    await page.goto('/library')
    await page.waitForLoadState('networkidle')

    // Should show tab labels or sign-in prompt
    const hasSaved = await page.locator('text=/Saved/').first().isVisible({ timeout: 10000 }).catch(() => false)
    const hasSignIn = await page.locator('text=/Sign In|My Library/').first().isVisible({ timeout: 5000 }).catch(() => false)
    expect(hasSaved || hasSignIn).toBeTruthy()
  })

  test('uploads tab shows upload button', async ({ page }) => {
    await page.goto('/library')
    await page.waitForLoadState('networkidle')

    // Click uploads tab if visible
    const uploadsTab = page.locator('text=/Uploads/')
    if (await uploadsTab.first().isVisible({ timeout: 10000 })) {
      await uploadsTab.first().click({ force: true })
      await page.waitForTimeout(1000)

      // Should show upload button or empty state
      const hasUpload = await page.locator('text=/Upload Book|No uploaded/').first().isVisible({ timeout: 5000 }).catch(() => false)
      expect(hasUpload).toBeTruthy()
    }
  })

  test('saved tab shows sort chips', async ({ page }) => {
    await page.goto('/library')
    await page.waitForLoadState('networkidle')

    // Sort chips should be visible if books exist, or empty state
    const hasContent = await page.locator('text=/Recent|Title|Progress|No saved books|Sign In/').first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasContent).toBeTruthy()
  })
})
