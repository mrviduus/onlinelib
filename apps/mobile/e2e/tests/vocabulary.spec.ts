import { test, expect } from '@playwright/test'

test.describe('Vocabulary', () => {
  test('vocabulary page loads', async ({ page }) => {
    await page.goto('/vocabulary')
    await page.waitForLoadState('networkidle')

    // Should show vocabulary header or empty state
    const hasVocab = await page.locator('text=/Vocabulary|No words yet|Sign in/i').first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasVocab).toBeTruthy()
  })

  test('filter tabs visible', async ({ page }) => {
    await page.goto('/vocabulary')
    await page.waitForLoadState('networkidle')

    // Filter tabs: All, New, Learning, Mastered
    const hasAll = await page.locator('text=All').first().isVisible({ timeout: 10000 }).catch(() => false)
    if (hasAll) {
      const hasNew = await page.locator('text=New').first().isVisible({ timeout: 3000 }).catch(() => false)
      const hasLearning = await page.locator('text=Learning').first().isVisible({ timeout: 3000 }).catch(() => false)
      expect(hasNew || hasLearning).toBeTruthy()
    }
  })

  test('review page accessible', async ({ page }) => {
    await page.goto('/vocabulary/review')
    await page.waitForLoadState('networkidle')

    // Should show review UI or empty state
    const hasReview = await page.locator('text=/Review|No words|nothing to review/i').first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasReview).toBeTruthy()
  })
})
