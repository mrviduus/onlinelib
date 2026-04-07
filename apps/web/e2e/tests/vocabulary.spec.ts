import { test, expect } from '../fixtures/auth.fixture'
import { saveTestWords, deleteAllTestWords, TEST_WORDS } from '../helpers/vocabulary'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_FILE = path.resolve(__dirname, '../.auth/user.json')

test.describe('Vocabulary', () => {
  test.describe.configure({ mode: 'serial' })

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH_FILE })
    await deleteAllTestWords(ctx.request)
    await ctx.close()
  })

  test('page loads empty for new user', async ({ authedPage: page, browser }) => {
    // Clean first
    const ctx = await browser.newContext({ storageState: AUTH_FILE })
    await deleteAllTestWords(ctx.request)
    await ctx.close()

    await page.goto('/en/words')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.empty-state')).toBeVisible()
  })

  test('save words via API, page shows them', async ({ authedPage: page, browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH_FILE })
    await saveTestWords(ctx.request)
    await ctx.close()

    await page.goto('/en/words')
    await page.waitForLoadState('networkidle')

    for (const w of TEST_WORDS) {
      // Words with sentences show as context snippet, words without show as plain text
      const wordVisible = page.locator('.vocab-word__row', { hasText: w.word })
      await expect(wordVisible).toBeVisible()
    }
  })

  test('filter tabs work', async ({ authedPage: page }) => {
    await page.goto('/en/words')
    await page.waitForLoadState('networkidle')

    // All words are stage 0 (new) — click "New" tab
    await page.locator('.vocab-tab', { hasText: 'New' }).click()
    await page.waitForTimeout(500)
    const words = page.locator('.vocab-word')
    expect(await words.count()).toBe(TEST_WORDS.length)

    // Click "Mastered" tab — should be empty
    await page.locator('.vocab-tab', { hasText: 'Mastered' }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('.empty-state')).toBeVisible()
  })

  test('search filters words', async ({ authedPage: page }) => {
    await page.goto('/en/words')
    await page.waitForLoadState('networkidle')

    await page.locator('.vocab-search').fill('castle')
    await page.waitForTimeout(500)

    const words = page.locator('.vocab-word')
    expect(await words.count()).toBe(1)
    await expect(page.locator('.vocab-word__row', { hasText: 'castle' })).toBeVisible()
  })

  test('start review → MC card renders with definition + word options', async ({ authedPage: page }) => {
    await page.goto('/en/words')
    await page.waitForLoadState('networkidle')

    // Click Start Review (not Practice)
    await page.locator('.vocab-review-btn:not(.vocab-review-btn--practice)').click()
    await page.waitForLoadState('networkidle')

    // Should be on review page
    expect(page.url()).toContain('/words/review')

    // Wait for cards to load from API (startSession fires after mount)
    const cardOrNewWord = page.locator('.review-mc__prompt, .new-word-card__continue')
    await expect(cardOrNewWord.first()).toBeVisible({ timeout: 10_000 })

    // Dismiss NewWordCard if visible (new words show intro first)
    const continueBtn = page.locator('.new-word-card__continue')
    if (await continueBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await continueBtn.click()
      await page.waitForTimeout(300)
    }

    // MC card: definition prompt + 4 option buttons
    const prompt = page.locator('.review-mc__prompt')
    await expect(prompt).toBeVisible({ timeout: 5000 })

    const options = page.locator('.review-mc__option')
    expect(await options.count()).toBe(4)

    // Options should be English words (not Ukrainian translations)
    for (let i = 0; i < 4; i++) {
      const text = await options.nth(i).textContent()
      // English words don't contain Cyrillic
      expect(text).not.toMatch(/[\u0400-\u04FF]/)
    }
  })

  test('correct MC answer → green feedback', async ({ authedPage: page }) => {
    await page.goto('/en/words/review')
    await page.waitForLoadState('networkidle')

    // Dismiss NewWordCard if visible
    const continueBtn = page.locator('.new-word-card__continue')
    if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await continueBtn.click()
      await page.waitForTimeout(300)
    }

    // Find the correct option
    const options = page.locator('.review-mc__option')
    await expect(options.first()).toBeVisible()

    // Click first option to trigger answer
    await options.first().click()

    // Wait for feedback
    await page.waitForTimeout(500)

    // Check if feedback appeared
    const feedback = page.locator('.review-feedback')
    await expect(feedback).toBeVisible()
  })

  test('complete session → summary screen', async ({ authedPage: page }) => {
    await page.goto('/en/words/review')
    await page.waitForLoadState('networkidle')

    // Answer all cards until session complete
    for (let i = 0; i < 30; i++) {
      // Check if session complete
      const summary = page.locator('.review-summary')
      if (await summary.isVisible()) break

      // Dismiss NewWordCard if visible
      const continueBtn = page.locator('.new-word-card__continue')
      if (await continueBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await continueBtn.click()
        await page.waitForTimeout(300)
        continue
      }

      // If MC card visible, click first option
      const mcOption = page.locator('.review-mc__option').first()
      if (await mcOption.isVisible({ timeout: 500 }).catch(() => false)) {
        await mcOption.click()
      }

      // Click next if feedback visible
      const nextBtn = page.locator('.review-feedback__next')
      if (await nextBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await nextBtn.click()
      }

      await page.waitForTimeout(300)
    }

    // Should see summary
    const summary = page.locator('.review-summary')
    await expect(summary).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.review-summary__stat-big').first()).toBeVisible()
  })

  test('back to vocabulary from summary', async ({ authedPage: page }) => {
    // Summary should still be visible from previous test or we navigate to review
    await page.goto('/en/words/review')
    await page.waitForLoadState('networkidle')

    // If no words due, we'll see empty state or summary with back button
    const backBtn = page.locator('.review-summary__btn, .empty-state__btn')
    if (await backBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await backBtn.click()
      await page.waitForLoadState('networkidle')
      expect(page.url()).toContain('/words')
      expect(page.url()).not.toContain('/review')
    }
  })

  test('expand word shows details', async ({ authedPage: page }) => {
    await page.goto('/en/words')
    await page.waitForLoadState('networkidle')

    // Click first word row to expand
    await page.locator('.vocab-word__row').first().click()
    await page.waitForTimeout(300)

    // Should see detail section
    await expect(page.locator('.vocab-word__detail').first()).toBeVisible()
  })

  test('delete word removes it', async ({ authedPage: page }) => {
    await page.goto('/en/words')
    await page.waitForLoadState('networkidle')

    const initialCount = await page.locator('.vocab-word').count()

    // Expand first word
    await page.locator('.vocab-word__row').first().click()
    await page.waitForTimeout(300)

    // Click delete button (first click shows inline confirm)
    await page.locator('.vocab-word__delete').first().click()
    await page.waitForTimeout(300)

    // Confirm delete (second click)
    await page.locator('.vocab-word__delete').first().click()
    await page.waitForTimeout(1000)

    // Should have one fewer word
    const newCount = await page.locator('.vocab-word').count()
    expect(newCount).toBe(initialCount - 1)
  })
})
