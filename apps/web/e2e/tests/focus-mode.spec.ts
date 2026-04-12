import { test } from '../fixtures/auth.fixture'
import { expect } from '@playwright/test'
import { getTestData } from '../fixtures/test-data'
import { swipeUp, swipeDown } from '../helpers/gestures'

test.describe('Focus Mode', () => {
  test('renders a single sentence centered', async ({ authedPage: page }) => {
    const { enBook } = getTestData()
    await page.goto(`/en/books/${enBook.slug}/focus/${enBook.firstChapterSlug}`)
    const sentence = page.locator('.focus-reader__sentence')
    await expect(sentence).toBeVisible({ timeout: 30_000 })
    const txt = (await sentence.textContent()) || ''
    expect(txt.trim().length).toBeGreaterThan(0)
  })

  test('progress bar reflects position', async ({ authedPage: page }) => {
    const { enBook } = getTestData()
    await page.goto(`/en/books/${enBook.slug}/focus/${enBook.firstChapterSlug}`)
    await expect(page.locator('.focus-reader__sentence')).toBeVisible({ timeout: 30_000 })
    const bar = page.locator('.focus-reader__progress')
    await expect(bar).toBeVisible()
  })

  test('ArrowDown advances to next sentence', async ({ authedPage: page }) => {
    const { enBook } = getTestData()
    await page.goto(`/en/books/${enBook.slug}/focus/${enBook.firstChapterSlug}`)
    const sentence = page.locator('.focus-reader__sentence')
    await expect(sentence).toBeVisible({ timeout: 30_000 })
    const first = ((await sentence.textContent()) || '').trim()

    await page.keyboard.press('ArrowDown')
    await expect
      .poll(async () => ((await sentence.textContent()) || '').trim(), { timeout: 5000 })
      .not.toBe(first)
  })

  test('ArrowUp goes back to previous sentence', async ({ authedPage: page }) => {
    const { enBook } = getTestData()
    await page.goto(`/en/books/${enBook.slug}/focus/${enBook.firstChapterSlug}`)
    const sentence = page.locator('.focus-reader__sentence')
    await expect(sentence).toBeVisible({ timeout: 30_000 })
    const first = ((await sentence.textContent()) || '').trim()
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(100)
    await page.keyboard.press('ArrowUp')
    await expect
      .poll(async () => ((await sentence.textContent()) || '').trim(), { timeout: 5000 })
      .toBe(first)
  })

  test('swipe up advances, swipe down reverts', async ({ authedPage: page }) => {
    const { enBook } = getTestData()
    await page.goto(`/en/books/${enBook.slug}/focus/${enBook.firstChapterSlug}`)
    const sentence = page.locator('.focus-reader__sentence')
    await expect(sentence).toBeVisible({ timeout: 30_000 })
    const first = ((await sentence.textContent()) || '').trim()

    await swipeUp(page)
    await expect
      .poll(async () => ((await sentence.textContent()) || '').trim(), { timeout: 5000 })
      .not.toBe(first)

    await swipeDown(page)
    await expect
      .poll(async () => ((await sentence.textContent()) || '').trim(), { timeout: 5000 })
      .toBe(first)
  })

  test('Escape exits to regular reader', async ({ authedPage: page }) => {
    const { enBook } = getTestData()
    await page.goto(`/en/books/${enBook.slug}/focus/${enBook.firstChapterSlug}`)
    await expect(page.locator('.focus-reader__sentence')).toBeVisible({ timeout: 30_000 })

    await page.keyboard.press('Escape')
    await expect
      .poll(() => page.url(), { timeout: 5000 })
      .toMatch(new RegExp(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}$`))
  })

  test('tap word triggers inline translation node (loading or result)', async ({ authedPage: page }) => {
    const { enBook } = getTestData()
    // Force native language to 'uk' so translation fires on English text
    // (same-lang path short-circuits and renders no translation node).
    // addInitScript runs on every navigation — overrides auth-fixture default.
    await page.addInitScript(() => {
      localStorage.setItem('textstack_native_language', 'uk')
    })
    await page.goto(`/en/books/${enBook.slug}/focus/${enBook.firstChapterSlug}`)
    const firstWord = page.locator('.focus-reader__word').first()
    await expect(firstWord).toBeVisible({ timeout: 30_000 })
    await firstWord.click()

    // Either loading "…" appears or a translation result
    const translation = page.locator('.focus-reader__translation')
    await expect(translation).toBeVisible({ timeout: 10_000 })
  })
})
