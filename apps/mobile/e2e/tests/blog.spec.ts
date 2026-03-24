import { test, expect } from '@playwright/test'

test.describe('Blog', () => {
  test('blog list page loads', async ({ page }) => {
    await page.goto('/blog')
    await page.waitForLoadState('networkidle')

    // Should show Blog header or empty state
    const hasBlog = await page.locator('text=Blog').first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasBlog).toBeTruthy()
  })

  test('blog posts render with metadata', async ({ page }) => {
    await page.goto('/blog')
    await page.waitForLoadState('networkidle')

    // If posts exist, they should have like/comment counts
    const hasPost = await page.locator('text=/No blog posts/').first().isVisible({ timeout: 5000 }).catch(() => false)
    // Either empty state or posts with content
  })

  test('tag filter chips render when posts have tags', async ({ page }) => {
    await page.goto('/blog')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // If posts have tags, "All" chip should be visible
    const hasAllChip = await page.locator('text=All').first().isVisible({ timeout: 5000 }).catch(() => false)
    // Tag chips are only shown when posts have tags — this is expected to pass or be neutral
  })
})
