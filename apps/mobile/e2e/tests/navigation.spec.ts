import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('home tab loads with books', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=TextStack').first()).toBeVisible({ timeout: 15000 })
  })

  test('search page loads', async ({ page }) => {
    await page.goto('/search')
    await page.waitForLoadState('networkidle')
    const hasSearch = await page.locator('text=/Search across all books|Search books/').first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasSearch).toBeTruthy()
  })

  test('library page loads', async ({ page }) => {
    await page.goto('/library')
    await page.waitForLoadState('networkidle')
    const hasContent = await page.locator('text=/Saved|My Library|Sign In/').first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasContent).toBeTruthy()
  })

  test('profile page loads', async ({ page }) => {
    await page.goto('/profile')
    await page.waitForLoadState('networkidle')
    const hasContent = await page.locator('text=/Sign In|Reading Stats|Browse/').first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasContent).toBeTruthy()
  })
})
