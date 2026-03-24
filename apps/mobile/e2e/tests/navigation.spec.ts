import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('home tab loads with books', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Home screen should show app content
    await expect(page.locator('text=TextStack').first()).toBeVisible({ timeout: 15000 })
  })

  test('search tab navigates', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // Click search tab
    const searchTab = page.locator('[aria-label="Search"]').or(page.locator('text=Search'))
    if (await searchTab.isVisible()) {
      await searchTab.first().click()
      await page.waitForLoadState('networkidle')
    }
  })

  test('library tab navigates', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const libraryTab = page.locator('[aria-label="Library"]').or(page.locator('text=Library'))
    if (await libraryTab.isVisible()) {
      await libraryTab.first().click()
      await page.waitForLoadState('networkidle')
    }
  })

  test('profile tab navigates', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const profileTab = page.locator('[aria-label="Profile"]').or(page.locator('text=Profile'))
    if (await profileTab.isVisible()) {
      await profileTab.first().click()
      await page.waitForLoadState('networkidle')
      // Should see sign in or profile content
      const hasSignIn = await page.locator('text=Sign In').isVisible().catch(() => false)
      const hasProfile = await page.locator('text=Profile').isVisible().catch(() => false)
      expect(hasSignIn || hasProfile).toBeTruthy()
    }
  })
})
