import { test, expect } from '@playwright/test'

/**
 * Vocabulary — the screen and its two review routes.
 *
 * "filter tabs visible" used to wrap its only assertion in `if (hasAll)`, so
 * when the tabs were missing — the case it existed to catch — it asserted
 * nothing and passed. The condition is now the assertion.
 *
 * Note the chrome here changed in #464: eight blocks above the first word
 * became three, and review style and sort moved into a view sheet. These tests
 * assert the three that stayed.
 */
test.describe('Vocabulary', () => {
  test('renders the screen or asks the reader to sign in', async ({ page }) => {
    await page.goto('/vocabulary')
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('text=/Vocabulary|No words yet|Sign in/i').first(),
    ).toBeVisible({ timeout: 15000 })
  })

  test('the filter row is present and is a row of filters', async ({ page }) => {
    await page.goto('/vocabulary')
    await page.waitForLoadState('networkidle')
    // Six filters since #464 — All, New, Learning, Mastered, Pending, Lookups.
    // Asserting two of them distinguishes "the row rendered" from "some element
    // somewhere happens to say All".
    await expect(page.locator('text=All').first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator('text=/New|Learning/').first()).toBeVisible({ timeout: 10000 })
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
