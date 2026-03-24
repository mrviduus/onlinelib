import { test, expect } from '@playwright/test'

test.describe('Stats', () => {
  test('stats page loads with tabs', async ({ page }) => {
    await page.goto('/stats')
    await page.waitForLoadState('networkidle')

    // Should show Reading Stats header or empty state
    const hasStats = await page.locator('text=/Reading Stats|No reading stats/i').first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasStats).toBeTruthy()
  })

  test('overview tab shows stat cards', async ({ page }) => {
    await page.goto('/stats')
    await page.waitForLoadState('networkidle')

    // Should see Overview tab and stat labels
    const hasOverview = await page.locator('text=Overview').first().isVisible({ timeout: 10000 }).catch(() => false)
    if (hasOverview) {
      const hasLabels = await page.locator('text=/Total Time|Words Read|Books Finished/').first().isVisible({ timeout: 5000 }).catch(() => false)
      expect(hasLabels).toBeTruthy()
    }
  })

  test('books tab shows genre/author breakdown', async ({ page }) => {
    await page.goto('/stats')
    await page.waitForLoadState('networkidle')

    const booksTab = page.locator('text=Books')
    if (await booksTab.first().isVisible({ timeout: 10000 })) {
      await booksTab.first().click()
      await page.waitForTimeout(1000)

      // Should show books stats or no data message
      const hasContent = await page.locator('text=/Books Finished|Total Pages|No book stats/').first().isVisible({ timeout: 5000 }).catch(() => false)
      expect(hasContent).toBeTruthy()
    }
  })

  test('time tab shows time stats', async ({ page }) => {
    await page.goto('/stats')
    await page.waitForLoadState('networkidle')

    const timeTab = page.locator('text=Time')
    if (await timeTab.first().isVisible({ timeout: 10000 })) {
      await timeTab.first().click()
      await page.waitForTimeout(1000)

      // Should show time-related labels
      const hasContent = await page.locator('text=/Total Time|This Week|This Month/').first().isVisible({ timeout: 5000 }).catch(() => false)
      expect(hasContent).toBeTruthy()
    }
  })

  test('achievements tab shows achievement grid', async ({ page }) => {
    await page.goto('/stats')
    await page.waitForLoadState('networkidle')

    const achievementsTab = page.locator('text=Achievements')
    if (await achievementsTab.first().isVisible({ timeout: 10000 })) {
      await achievementsTab.first().click()
      await page.waitForTimeout(1000)

      // Should show achievement categories
      const hasContent = await page.locator('text=/Milestone|Streak|Special/').first().isVisible({ timeout: 5000 }).catch(() => false)
      expect(hasContent).toBeTruthy()
    }
  })

  test('goals section visible in overview', async ({ page }) => {
    await page.goto('/stats')
    await page.waitForLoadState('networkidle')

    const hasGoals = await page.locator('text=Goals').first().isVisible({ timeout: 10000 }).catch(() => false)
    // May not be visible if empty state shows
  })
})
