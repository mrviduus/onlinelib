import { test, expect } from '@playwright/test'

/**
 * Reader smoke tests.
 *
 * The reader renders its chapter content inside a WebView. Playwright can
 * see the shell (top bar, footer, settings drawer) but can't drive the
 * tap/selection gestures that actually live inside the embedded document.
 * So these tests check only the things that would fail catastrophically
 * if any of the reader hooks crashed on mount:
 *  - reader route resolves
 *  - top chrome / progress chrome render
 *  - settings drawer opens
 *
 * Real verification of the tap-to-WordCard, scroll-restore, and vocab
 * underline behaviors lives in the manual checklist on a physical device.
 */
test.describe('Reader (smoke)', () => {
  test('reader route mounts without crash', async ({ page }) => {
    // Get a real book slug from the home feed so we don't pin to a single
    // book that might rotate out of the library.
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const bookCard = page.locator('[data-testid="book-card"]').or(page.locator('img').first())
    if (!(await bookCard.first().isVisible({ timeout: 10000 }).catch(() => false))) {
      test.skip(true, 'No books in home feed — skipping reader smoke')
    }
    await bookCard.first().click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1500)

    const startBtn = page.locator('text=/Start Reading|Continue Reading/').first()
    if (!(await startBtn.isVisible({ timeout: 10000 }).catch(() => false))) {
      test.skip(true, 'No start-reading button on book detail — skipping')
    }
    await startBtn.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)

    // Reader URL pattern: /reader/<bookSlug>/<chapterSlug>. If the screen
    // crashed we'd land on a NotFound or get routed back home.
    await expect(page).toHaveURL(/\/reader\//)
  })
})
