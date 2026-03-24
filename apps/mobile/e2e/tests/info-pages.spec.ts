import { test, expect } from '@playwright/test'

test.describe('Info Pages', () => {
  test('about page loads', async ({ page }) => {
    await page.goto('/about')
    await page.waitForLoadState('networkidle')
    const hasContent = await page.locator('text=/About/i').first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasContent).toBeTruthy()
  })

  test('privacy page loads', async ({ page }) => {
    await page.goto('/privacy')
    await page.waitForLoadState('networkidle')
    const hasContent = await page.locator('text=/Privacy/i').first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasContent).toBeTruthy()
  })

  test('terms page loads', async ({ page }) => {
    await page.goto('/terms')
    await page.waitForLoadState('networkidle')
    const hasContent = await page.locator('text=/Terms/i').first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasContent).toBeTruthy()
  })

  test('contact page loads', async ({ page }) => {
    await page.goto('/contact')
    await page.waitForLoadState('networkidle')
    const hasContent = await page.locator('text=/Contact/i').first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasContent).toBeTruthy()
  })
})
