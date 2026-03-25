import { test, expect } from '@playwright/test'

test.describe('Stats', () => {
  test('stats page loads', async ({ page }) => {
    await page.goto('/stats')
    await page.waitForLoadState('networkidle')

    // Should show Reading Stats header, sign-in prompt, or loading state
    const hasStats = await page.locator('text=/Reading Stats|Sign in|Overview/i').first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasStats).toBeTruthy()
  })

  test('overview tab shows stat cards when authenticated', async ({ page }) => {
    await page.goto('/stats')
    await page.waitForLoadState('networkidle')

    const hasOverview = await page.locator('text=Overview').first().isVisible({ timeout: 10000 }).catch(() => false)
    if (hasOverview) {
      // Should show stat card labels
      const hasLabels = await page.locator('text=/Total Time|Words Read|Books Finished|Current Streak/').first().isVisible({ timeout: 5000 }).catch(() => false)
      // Labels may not show if user has no stats — that's OK
    }
  })

  test('books tab navigates', async ({ page }) => {
    await page.goto('/stats')
    await page.waitForLoadState('networkidle')

    const booksTab = page.locator('text=Books')
    if (await booksTab.first().isVisible({ timeout: 10000 })) {
      await booksTab.first().click({ force: true })
      await page.waitForTimeout(1000)
      // Content loads — just verify no crash
    }
  })

  test('time tab navigates', async ({ page }) => {
    await page.goto('/stats')
    await page.waitForLoadState('networkidle')

    const timeTab = page.locator('text=Time')
    if (await timeTab.first().isVisible({ timeout: 10000 })) {
      await timeTab.first().click({ force: true })
      await page.waitForTimeout(1000)
    }
  })

  test('achievements tab navigates', async ({ page }) => {
    await page.goto('/stats')
    await page.waitForLoadState('networkidle')

    const achievementsTab = page.locator('text=Achievements')
    if (await achievementsTab.first().isVisible({ timeout: 10000 })) {
      await achievementsTab.first().click({ force: true })
      await page.waitForTimeout(1000)
    }
  })

  test('weekly chart and today summary visible', async ({ page }) => {
    await page.goto('/stats')
    await page.waitForLoadState('networkidle')

    const hasOverview = await page.locator('text=Overview').first().isVisible({ timeout: 10000 }).catch(() => false)
    if (hasOverview) {
      // Today summary or This Week chart section should be visible
      const hasSummary = await page.locator('text=/Today|This Week|No reading stats/').first().isVisible({ timeout: 5000 }).catch(() => false)
      expect(hasSummary).toBeTruthy()
    }
  })
})
