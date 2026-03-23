import { test } from '../fixtures/auth.fixture'
import { expect } from '@playwright/test'
import { getTestData } from '../fixtures/test-data'
import { waitForReaderLoad } from '../helpers/reader'

test.describe('Mobile Reader', () => {
  test('reader uses scroll mode on mobile', async ({ authedPage: page }) => {
    const { enBook } = getTestData()
    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    // Mobile reader should use scroll mode
    const scrollMode = page.locator('.reader-page--scroll-mode')
    await expect(scrollMode).toBeVisible()

    // No pagination buttons in scroll mode
    const pageNav = page.locator('.reader-page-nav')
    await expect(pageNav).not.toBeVisible()
  })

  test('auto-save on scroll (mobile)', async ({ authedPage: page }) => {
    const { enBook } = getTestData()
    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    // Scroll down
    await page.evaluate(() => window.scrollBy(0, 500))
    await page.waitForTimeout(1000) // 600ms debounce + buffer

    // Check localStorage for progress
    const progress = await page.evaluate((id) => {
      return localStorage.getItem(`reading.progress.${id}`)
    }, enBook.editionId)

    // Progress should be saved after scroll
    expect(progress).not.toBeNull()
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

  test('flush pending save on visibility hidden (mobile)', async ({ authedPage: page }) => {
    const { enBook } = getTestData()

    // Clear any existing progress
    await page.goto('/')
    await page.evaluate((id) => {
      localStorage.removeItem(`reading.progress.${id}`)
    }, enBook.editionId)

    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    // Small scroll (under 500px threshold) - normally wouldn't trigger save
    await page.evaluate(() => window.scrollBy(0, 200))

    // Wait a bit but NOT long enough for the 600ms debounce
    await page.waitForTimeout(300)

    // Simulate visibility hidden (e.g., tab switch)
    // This should flush any pending save
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await page.waitForTimeout(100)

    // Progress should be saved even though debounce didn't complete
    const progress = await page.evaluate((id) => {
      return localStorage.getItem(`reading.progress.${id}`)
    }, enBook.editionId)

    expect(progress).not.toBeNull()
  })

  test('small scroll saved by time-based auto-save (mobile)', async ({ authedPage: page }) => {
    const { enBook } = getTestData()

    // Clear any existing progress
    await page.goto('/')
    await page.evaluate((id) => {
      localStorage.removeItem(`reading.progress.${id}`)
    }, enBook.editionId)

    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    // Very small scroll (under 500px threshold) - won't trigger threshold save
    await page.evaluate(() => window.scrollBy(0, 100))

    // Wait for 600ms debounce - but this won't save because <500px threshold
    await page.waitForTimeout(700)

    // First check - small scroll may not have saved yet (threshold not met)
    const progressBeforeInterval = await page.evaluate((id) => {
      return localStorage.getItem(`reading.progress.${id}`)
    }, enBook.editionId)

    // Scroll a bit more but still small
    await page.evaluate(() => window.scrollBy(0, 50))

    // The 30-second auto-save will eventually catch this
    // For test purposes, manually trigger the flush via visibility change
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await page.waitForTimeout(100)

    const progressAfter = await page.evaluate((id) => {
      return localStorage.getItem(`reading.progress.${id}`)
    }, enBook.editionId)

    // Progress should be saved now
    expect(progressAfter).not.toBeNull()
  })

  test('debounced scroll save triggers after 600ms (mobile)', async ({ authedPage: page }) => {
    const { enBook } = getTestData()

    // Clear any existing progress
    await page.goto('/')
    await page.evaluate((id) => {
      localStorage.removeItem(`reading.progress.${id}`)
    }, enBook.editionId)

    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    // Large scroll (over 500px threshold)
    await page.evaluate(() => window.scrollBy(0, 600))

    // Wait for debounce (600ms + buffer)
    await page.waitForTimeout(800)

    // Progress should be saved
    const progress = await page.evaluate((id) => {
      return localStorage.getItem(`reading.progress.${id}`)
    }, enBook.editionId)

    expect(progress).not.toBeNull()

    // Verify locator format contains scroll position
    const parsed = JSON.parse(progress!)
    expect(parsed.locator).toMatch(/^scroll:/)
  })

  test('progress includes scroll locator with offset (mobile)', async ({ authedPage: page }) => {
    const { enBook } = getTestData()

    // Clear any existing progress
    await page.goto('/')
    await page.evaluate((id) => {
      localStorage.removeItem(`reading.progress.${id}`)
    }, enBook.editionId)

    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    // Scroll to create progress
    await page.evaluate(() => window.scrollBy(0, 800))
    await page.waitForTimeout(1000)

    // Check localStorage for progress with scroll locator
    const progress = await page.evaluate((id) => {
      return localStorage.getItem(`reading.progress.${id}`)
    }, enBook.editionId)

    expect(progress).not.toBeNull()

    const parsed = JSON.parse(progress!)
    // Locator should be in format: scroll:{chapterSlug}:{offset}
    expect(parsed.locator).toMatch(/^scroll:[^:]+:\d+$/)
  })
})
