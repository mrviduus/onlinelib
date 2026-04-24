import { test } from '../fixtures/auth.fixture'
import { expect } from '@playwright/test'
import { getTestData } from '../fixtures/test-data'
import { waitForReaderLoad } from '../helpers/reader'

// Regression guard for the reader overlay v2 path before we flip the default-on
// flag. Covers: v2 mounts the SVG overlay, storage killswitch falls back to the
// legacy ReaderContent path, window killswitch does the same.

test.describe('QA-010: reader overlay v2', () => {
  test.describe.configure({ timeout: 60_000 })

  test('opt-in via localStorage mounts the SVG overlay', async ({ authedPage: page }) => {
    const { enBook } = getTestData()

    // Enable v2 before any navigation so features.ts reads it at first render.
    await page.addInitScript(() => {
      localStorage.setItem('textstack.readerOverlayV2', '1')
    })

    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    const overlay = page.locator('svg[data-reader-overlay="true"]')
    await expect(overlay).toHaveCount(1, { timeout: 10_000 })

    // ReaderNav (v2-only) renders the Prev/Next affordance
    await expect(page.locator('.reader-nav, [data-testid="reader-nav"]').first()).toBeVisible({ timeout: 5_000 })
  })

  test('storage killswitch "0" falls back to legacy ReaderContent', async ({ authedPage: page }) => {
    const { enBook } = getTestData()

    // Opt into v2 at build would've made this kick in; force both the opt-in
    // and the kill so we exercise the cascade's killswitch wins-over-enable.
    await page.addInitScript(() => {
      localStorage.setItem('textstack.readerOverlayV2', '0')
      ;(window as unknown as { __textstackForceOverlayReader?: boolean }).__textstackForceOverlayReader = true
    })

    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    // Legacy path — no v2 SVG overlay in the DOM.
    await expect(page.locator('svg[data-reader-overlay="true"]')).toHaveCount(0)
  })

  test('window killswitch forces legacy even when storage enables v2', async ({ authedPage: page }) => {
    const { enBook } = getTestData()

    await page.addInitScript(() => {
      localStorage.setItem('textstack.readerOverlayV2', '1')
      ;(window as unknown as { __textstackForceLegacyReader?: boolean }).__textstackForceLegacyReader = true
    })

    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    await expect(page.locator('svg[data-reader-overlay="true"]')).toHaveCount(0)
  })
})
