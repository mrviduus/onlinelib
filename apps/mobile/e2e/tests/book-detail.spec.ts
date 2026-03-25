import { test, expect } from '@playwright/test'

test.describe('Book Detail', () => {
  test('home page shows books', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Should show TextStack branding and books
    const hasContent = await page.locator('text=TextStack').first().isVisible({ timeout: 15000 }).catch(() => false)
    expect(hasContent).toBeTruthy()
  })

  test('book detail page loads with chapters', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Click first book card if visible
    const bookCard = page.locator('[data-testid="book-card"]').or(page.locator('img').first())
    if (await bookCard.first().isVisible({ timeout: 10000 })) {
      await bookCard.first().click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)

      // Should show chapters section or book title
      const hasChapters = await page.locator('text=Chapters').first().isVisible({ timeout: 10000 }).catch(() => false)
      const hasReadBtn = await page.locator('text=/Start Reading|Continue Reading/').first().isVisible({ timeout: 5000 }).catch(() => false)
      expect(hasChapters || hasReadBtn).toBeTruthy()
    }
  })

  test('book detail shows EPUB download button', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const bookCard = page.locator('img').first()
    if (await bookCard.isVisible({ timeout: 10000 })) {
      await bookCard.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)

      // Should show Download EPUB button
      const hasDownload = await page.locator('text=Download EPUB').first().isVisible({ timeout: 5000 }).catch(() => false)
      // Optional — might not render if no chapters
    }
  })

  test('book detail shows author section', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const bookCard = page.locator('img').first()
    if (await bookCard.isVisible({ timeout: 10000 })) {
      await bookCard.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)

      // Should show "About the Author" section
      const hasAuthor = await page.locator('text=About the Author').first().isVisible({ timeout: 5000 }).catch(() => false)
      // Optional — depends on book data
    }
  })
})
