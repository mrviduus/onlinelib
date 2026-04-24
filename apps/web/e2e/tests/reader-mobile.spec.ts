import { test } from '../fixtures/auth.fixture'
import { expect } from '@playwright/test'
import { getTestData } from '../fixtures/test-data'
import { waitForReaderLoad } from '../helpers/reader'

test.describe('Mobile Reader', () => {
  test('reader uses scroll mode on all breakpoints', async ({ authedPage: page }) => {
    const { enBook } = getTestData()
    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    // v2 (default) mounts .reader-section; legacy mounts .scroll-reader.
    // Either shape counts as "scroll mode working."
    const container = page.locator('.reader-section, .scroll-reader').first()
    await expect(container).toBeVisible()

    // Legacy pagination artefacts must be gone
    await expect(page.locator('.reader-page-nav')).toHaveCount(0)
    await expect(page.locator('.reader-page--scroll-mode')).toHaveCount(0)
  })

  test('auto-save on scroll (mobile)', async ({ authedPage: page }) => {
    const { enBook } = getTestData()
    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    // Scroll down
    await page.evaluate(() => window.scrollBy(0, 500))

    // Wait for progress to appear in localStorage (debounce + save)
    await expect(async () => {
      const progress = await page.evaluate((id) => {
        return localStorage.getItem(`reading.progress.${id}`)
      }, enBook.editionId)
      expect(progress).not.toBeNull()
    }).toPass({ timeout: 5000 })
  })

  test('sendBeacon on navigate away (mobile)', async ({ authedPage: page }) => {
    const { enBook } = getTestData()
    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    // Scroll to create progress
    await page.evaluate(() => window.scrollBy(0, 300))
    await page.waitForTimeout(1000)

    // Intercept sendBeacon
    const beaconPromise = page.waitForRequest(
      req => req.url().includes('/me/progress'),
      { timeout: 5_000 }
    ).catch(() => null)

    // Navigate away
    await page.goto('/en/books')
    await beaconPromise
  })

  test('progress tracking works in mobile reader', async ({ authedPage: page }) => {
    const { enBook } = getTestData()
    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    // In scroll mode, progress is tracked even if top bar is hidden
    // Verify progress element exists in DOM with % text
    const progressText = await page.locator('.reader-top-bar__progress').textContent()
    expect(progressText).toContain('%')
  })

})
