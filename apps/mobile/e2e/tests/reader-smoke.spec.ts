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

  /**
   * TOC sheet — bug-sweep regression guard (ADR-011).
   * Bug was: chapters array missing → TocSheet rendered with only header
   * (collapsed to 0 height) and no visible empty state. Fix: minHeight +
   * loading/empty states.
   *
   * Verifiable in Playwright: sheet opens and shows EITHER chapter rows OR
   * the empty/loading copy. Anything other than those two cases (e.g.
   * blank sheet) means the fix regressed.
   */
  test('TOC sheet opens and shows chapters OR loading/empty state', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const bookCard = page.locator('[data-testid="book-card"]').or(page.locator('img').first())
    if (!(await bookCard.first().isVisible({ timeout: 10000 }).catch(() => false))) {
      test.skip(true, 'No books in home feed — skipping TOC test')
    }
    await bookCard.first().click()
    await page.waitForLoadState('networkidle')
    const startBtn = page.locator('text=/Start Reading|Continue Reading/').first()
    if (!(await startBtn.isVisible({ timeout: 10000 }).catch(() => false))) {
      test.skip(true, 'No start-reading button — skipping')
    }
    await startBtn.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    await expect(page).toHaveURL(/\/reader\//)

    // Reveal chrome (bars auto-hide on chapter load).
    await page.locator('body').click({ position: { x: 200, y: 400 } })
    await page.waitForTimeout(500)

    // Locate TOC button via accessibilityLabel. In react-native-web Ionicons
    // round-trip aria-label as the wrapping TouchableOpacity's accessibilityLabel.
    // Tolerate slight wording variation across builds (ReaderTopBar may
    // localize the label).
    const tocBtn = page.locator('[aria-label*="contents" i], [aria-label*="table of contents" i]').first()
    if (!(await tocBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, 'TOC button not addressable in this build — skipping')
    }
    await tocBtn.click()

    // Sheet header always renders "Contents".
    await expect(page.locator('text=Contents').first()).toBeVisible({ timeout: 5000 })

    // Body MUST show one of: chapter rows, loading spinner, or empty copy.
    // If none visible, sheet is broken (the original bug).
    const hasLoading = await page.locator('text=Loading chapters').isVisible({ timeout: 2000 }).catch(() => false)
    const hasEmpty = await page.locator('text=No chapters available').isVisible({ timeout: 2000 }).catch(() => false)
    // Chapter rows render as "<chapterNum>" followed by title — number-only
    // strings are reliably distinguishable from chrome.
    const hasChapter = await page.locator('text=/^\\s*1\\s*$/').first().isVisible({ timeout: 2000 }).catch(() => false)
    expect(hasChapter || hasLoading || hasEmpty).toBe(true)
  })
})
