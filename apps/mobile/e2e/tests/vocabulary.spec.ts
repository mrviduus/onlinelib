import { test, expect } from '@playwright/test'

/**
 * Vocabulary — the screen and its two review routes.
 *
 * "filter tabs visible" used to wrap its only assertion in `if (hasAll)`, so
 * when the tabs were missing — the case it existed to catch — it asserted
 * nothing and passed. The condition is now the assertion.
 *
 * Note the chrome here changed in #464: eight blocks above the first word
 * became three, and review style and sort moved into a view sheet.
 *
 * This lane is signed out. Since the screen learned to check for a session,
 * none of that chrome exists here — the filter-row test was replaced by the
 * assertion that actually holds signed out. The signed-in list, its filters and
 * its sort are unreachable from this lane and belong to a fixtured one.
 */
test.describe('Vocabulary', () => {
  test('renders the screen or asks the reader to sign in', async ({ page }) => {
    await page.goto('/vocabulary')
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('text=/Vocabulary|No words yet|Sign in/i').first(),
    ).toBeVisible({ timeout: 15000 })
  })

  test('signed out, it offers a way in instead of reporting a failure', async ({ page }) => {
    // This replaces 'the filter row is present and is a row of filters', which
    // asserted All + New/Learning unconditionally. That test was green, and it
    // was green for the wrong reason: this lane runs signed out (no
    // `storageState`, no `globalSetup` — see e2e/README.md, "Signed out by
    // default"), and the six filter chips rendered above an EmptyState reading
    // "Couldn't load your library". The row it checked was chrome on top of a
    // dead end. Signed out there is nothing to filter, so the row is gone and
    // the assertion no longer has anything true to say.
    //
    // What is true signed out is asserted instead, and both halves can fail:
    // the invitation must be there, and the failure copy must not.
    await page.goto('/vocabulary')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('text=/Sign in to build your personal vocabulary/i').first())
      .toBeVisible({ timeout: 15000 })
    // The regression itself: /me/vocabulary/words 401s, `isOfflineError` is
    // false for a 401, and the screen called it a server fault.
    await expect(page.locator("text=/Couldn't load your library|went wrong on our side/i"))
      .toHaveCount(0)
  })

  test('the review route renders', async ({ page }) => {
    await page.goto('/vocabulary/review')
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('text=/Review|No words|nothing to review|Sign in/i').first(),
    ).toBeVisible({ timeout: 15000 })
  })

  test('the practice route renders', async ({ page }) => {
    await page.goto('/vocabulary/review?practice=1')
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('text=/Practice|Review|No words|nothing to review|Sign in/i').first(),
    ).toBeVisible({ timeout: 15000 })
  })
})
