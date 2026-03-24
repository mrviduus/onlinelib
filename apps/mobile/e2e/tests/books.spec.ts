import { test, expect } from '@playwright/test'

test.describe('Books', () => {
  test('books page loads with search and sort', async ({ page }) => {
    await page.goto('/books')
    await page.waitForLoadState('networkidle')

    // Search bar visible
    const hasSearch = await page.locator('input[placeholder*="Search"]').first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasSearch).toBeTruthy()

    // Sort chips visible
    const hasSort = await page.locator('text=Recent').first().isVisible({ timeout: 5000 }).catch(() => false)
    expect(hasSort).toBeTruthy()
  })

  test('sort chips are clickable', async ({ page }) => {
    await page.goto('/books')
    await page.waitForLoadState('networkidle')

    // Click Title sort
    const titleChip = page.locator('text=Title').first()
    if (await titleChip.isVisible({ timeout: 5000 }).catch(() => false)) {
      await titleChip.click({ force: true })
    }

    // Click Oldest sort
    const oldestChip = page.locator('text=Oldest').first()
    if (await oldestChip.isVisible({ timeout: 5000 }).catch(() => false)) {
      await oldestChip.click({ force: true })
    }
  })

  test('genre chips or books visible', async ({ page }) => {
    await page.goto('/books')
    await page.waitForLoadState('networkidle')

    // Either genre chips or book cards or empty state
    const hasContent = await page.locator('text=/All|No books/').first().isVisible({ timeout: 10000 }).catch(() => false)
    expect(hasContent).toBeTruthy()
  })
})
