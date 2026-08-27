import { test, expect } from '@playwright/test'

/**
 * Highlights — the screen and its review route.
 *
 * Two tests were deleted: "book type tabs visible" and "sort and color filters
 * visible". Both hid their only assertion inside an `if`, so the case they
 * existed to catch — the row missing — passed silently. They are not converted
 * here because signed out this screen renders a sign-in prompt and those rows do
 * not exist to be asserted; making the claim needs an authenticated fixture,
 * which is Lane A's job (MOBILE-TEST-PLAN.md).
 *
 * Every expectation below accepts the sign-in branch explicitly, rather than
 * assuming a session this lane does not establish.
 */
test.describe('Highlights', () => {
  test('renders the screen or asks the reader to sign in', async ({ page }) => {
    await page.goto('/highlights')
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('text=/Highlights|Sign in/i').first(),
    ).toBeVisible({ timeout: 15000 })
  })

  test('renders its search field or the sign-in prompt', async ({ page }) => {
    await page.goto('/highlights')
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('input[placeholder*="Search" i]').first()
        .or(page.locator('text=/Sign in/i').first()),
    ).toBeVisible({ timeout: 15000 })
  })

  test('the review route renders', async ({ page }) => {
    await page.goto('/highlights/review')
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('text=/Review|caught up|No highlights|Sign in/i').first(),
    ).toBeVisible({ timeout: 15000 })
  })
})
