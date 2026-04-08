import { test, expect } from '../fixtures/auth.fixture'
import { testLogin } from '../helpers/api'

const API_URL = process.env.API_URL ?? 'http://localhost:8080'
const HEADERS = { Host: 'general.localhost', 'Content-Type': 'application/json' }

const TEST_WORDS = [
  { word: 'ephemeral', translation: 'ефемерний', originalSentence: 'The ephemeral beauty of the sunset.' },
  { word: 'ubiquitous', translation: 'повсюдний', originalSentence: 'Smartphones are ubiquitous today.' },
  { word: 'sanguine', translation: 'оптимістичний', originalSentence: 'She remained sanguine despite the setback.' },
]

test.describe.serial('Practice page', () => {
  test.beforeAll(async ({ request }) => {
    await testLogin(request)
    // Clean up any existing test words
    const wordsResp = await request.get(`${API_URL}/me/vocabulary/words?limit=100`, { headers: HEADERS })
    if (wordsResp.ok()) {
      const data = await wordsResp.json()
      for (const w of data.items ?? []) {
        await request.delete(`${API_URL}/me/vocabulary/words/${w.id}`, { headers: HEADERS })
      }
    }
  })

  test('practice page loads for authenticated user', async ({ authedPage: page }) => {
    await page.goto('/en/practice/')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.practice-page')).toBeVisible()
  })

  test('save words and practice page shows stats', async ({ authedPage: page, request }) => {
    await testLogin(request)

    // Save test words
    for (const w of TEST_WORDS) {
      await request.post(`${API_URL}/me/vocabulary/words`, {
        headers: HEADERS,
        data: w,
      })
    }

    await page.goto('/en/practice/')
    await page.waitForLoadState('networkidle')

    // Stats row should show total words
    await expect(page.locator('.practice-page__stat-value').first()).toContainText(String(TEST_WORDS.length))

    // Practice button should be enabled
    const startBtn = page.locator('.practice-page__start-btn')
    await expect(startBtn).toBeEnabled()
    await expect(startBtn).toContainText('words')
  })

  test('flashcards is default mode', async ({ authedPage: page }) => {
    await page.goto('/en/practice/')
    await page.evaluate(() => localStorage.removeItem('practiceMode'))
    await page.reload()
    await page.waitForLoadState('networkidle')

    const flashcardsBtn = page.locator('.vocab-mode-toggle__btn--active')
    await expect(flashcardsBtn).toContainText('Flashcards')
  })

  test('flashcards listed first in mode toggle', async ({ authedPage: page }) => {
    await page.goto('/en/practice/')
    await page.waitForLoadState('networkidle')

    const buttons = page.locator('.vocab-mode-toggle__btn')
    await expect(buttons.nth(0)).toContainText('Flashcards')
    await expect(buttons.nth(1)).toContainText('Blitz')
  })

  test('streak badge shows in header when words due', async ({ authedPage: page }) => {
    await page.goto('/en/practice/')
    await page.waitForLoadState('networkidle')

    const badge = page.locator('[data-testid="streak-badge"]')
    await expect(badge).toBeVisible()
  })

  test('streak badge popup opens and closes', async ({ authedPage: page }) => {
    await page.goto('/en/practice/')
    await page.waitForLoadState('networkidle')

    const badgeBtn = page.locator('.streak-badge-wrapper button')
    await badgeBtn.click()
    const popup = page.locator('.vocab-badge-popup')
    await expect(popup).toBeVisible()
    await expect(popup).toContainText('words reviewed')

    await badgeBtn.click()
    await expect(popup).not.toBeVisible()
  })

  test('start review session in flashcard mode', async ({ authedPage: page }) => {
    await page.goto('/en/practice/')
    await page.waitForLoadState('networkidle')

    const startBtn = page.locator('.practice-page__start-btn')
    await startBtn.click()

    await page.waitForURL(/\/words\/review/)
    await expect(page.locator('.flash-card, .new-word-card, .review-progress')).toBeVisible()
  })

  test('session summary shows positive message', async ({ authedPage: page }) => {
    await page.goto('/en/words/review?reviewMode=classic')
    await page.waitForLoadState('networkidle')

    const maxCards = 10
    for (let i = 0; i < maxCards; i++) {
      const cardOrSummary = await Promise.race([
        page.locator('.flash-card-wrapper').waitFor({ timeout: 3000 }).then(() => 'card'),
        page.locator('.new-word-card').waitFor({ timeout: 3000 }).then(() => 'new'),
        page.locator('.review-summary').waitFor({ timeout: 3000 }).then(() => 'summary'),
      ]).catch(() => 'timeout')

      if (cardOrSummary === 'summary' || cardOrSummary === 'timeout') break

      if (cardOrSummary === 'new') {
        await page.locator('.new-word-card__continue').click()
        continue
      }

      await page.locator('.flash-card-wrapper').click()
      await page.waitForTimeout(400)
      const assessBtn = page.locator('.flash-card__assess').first()
      if (await assessBtn.isVisible()) {
        await assessBtn.click()
      }

      await page.waitForTimeout(300)
      const nextBtn = page.locator('.review-feedback__next, .review-feedback-mini button')
      if (await nextBtn.isVisible()) {
        await nextBtn.click()
      }
    }

    const summary = page.locator('.review-summary')
    await expect(summary).toBeVisible({ timeout: 10000 })

    const banner = summary.locator('.review-summary__banner-message')
    const text = await banner.textContent()
    expect(text).toMatch(/great work|excellent|perfect/i)
  })

  // Cleanup
  test.afterAll(async ({ request }) => {
    await testLogin(request)
    const wordsResp = await request.get(`${API_URL}/me/vocabulary/words?limit=100`, { headers: HEADERS })
    if (wordsResp.ok()) {
      const data = await wordsResp.json()
      for (const w of data.items ?? []) {
        await request.delete(`${API_URL}/me/vocabulary/words/${w.id}`, { headers: HEADERS })
      }
    }
  })
})
