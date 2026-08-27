import { test, expect } from '@playwright/test'

/**
 * Reader smoke.
 *
 * The reader renders its chapter inside a WebView. Playwright sees the shell —
 * top bar, footer, sheets — but cannot drive the tap and selection gestures that
 * live inside the embedded document, so this file checks only what would fail
 * catastrophically if a reader hook crashed on mount. The gestures are covered
 * by unit tests over the pure decisions (`pdfPersistGate`, `readerChrome`,
 * `pdfViewerChrome`) and by a device pass.
 *
 * **On skipping.** The previous version skipped itself six ways: no book card,
 * no start button, no TOC button. Every one of those is also what a broken
 * reader looks like, so the suite went green in exactly the cases it existed to
 * catch. Only one precondition is genuinely environmental — whether this
 * deployment's catalog has any books at all — and it is now the single skip,
 * with a message that says so. Everything downstream of it fails.
 */

/** Navigate from the catalog to an open reader. Fails loudly at every step. */
async function openFirstBook(page: import('@playwright/test').Page) {
  // `/` is an auth-aware redirect since #453; signed out it lands on Discover,
  // which lists recently added books.
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const bookCard = page.locator('[data-testid="book-card"]').or(page.locator('img')).first()
  const catalogHasBooks = await bookCard.isVisible({ timeout: 15000 }).catch(() => false)
  test.skip(!catalogHasBooks, 'This deployment has an empty catalog — nothing to open.')

  await bookCard.click()
  await page.waitForLoadState('networkidle')

  // A book that opened must offer a way in. If this is missing the detail
  // screen is broken, which is a failure, not a reason to stop looking.
  const startBtn = page.locator('text=/Start Reading|Continue Reading|Start reading/').first()
  await expect(startBtn).toBeVisible({ timeout: 15000 })
  await startBtn.click()
  await page.waitForLoadState('networkidle')

  await expect(page).toHaveURL(/\/reader\//, { timeout: 15000 })
}

test.describe('Reader (smoke)', () => {
  test('a catalog book opens into the reader', async ({ page }) => {
    await openFirstBook(page)
  })

  test('the table of contents opens and is never an empty sheet', async ({ page }) => {
    // ADR-011 regression guard. The bug was a missing chapters array rendering
    // the sheet collapsed to zero height with no empty state — a sheet that
    // opens onto nothing at all.
    await openFirstBook(page)

    // Bars auto-hide three seconds after load; a tap brings them back. Since
    // #463 a tap anywhere does this, including on a word.
    await page.locator('body').click({ position: { x: 200, y: 400 } })

    const tocBtn = page.locator('[aria-label*="contents" i], [aria-label*="table of contents" i]').first()
    await expect(tocBtn).toBeVisible({ timeout: 10000 })
    await tocBtn.click()

    await expect(page.locator('text=Contents').first()).toBeVisible({ timeout: 10000 })

    // The body must say one of three things. Anything else — most importantly
    // nothing — is the bug this test exists for.
    await expect(
      page.locator('text=Loading chapters').first()
        .or(page.locator('text=No chapters available').first())
        .or(page.locator('text=/^\\s*1\\s*$/').first()),
    ).toBeVisible({ timeout: 10000 })
  })
})
