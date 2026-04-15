import { test, expect } from '../fixtures/auth.fixture'
import { testLogin } from '../helpers/api'

const API_URL = process.env.API_URL ?? 'http://localhost:8080'
const HEADERS = { Host: 'general.localhost', 'Content-Type': 'application/json' }

const TEST_WORDS = [
  { word: 'ephemeral', language: 'en', translation: 'ефемерний', sentence: 'The ephemeral beauty of the sunset.' },
  { word: 'ubiquitous', language: 'en', translation: 'повсюдний', sentence: 'Smartphones are ubiquitous today.' },
  { word: 'sanguine', language: 'en', translation: 'оптимістичний', sentence: 'She remained sanguine despite the setback.' },
]

async function cleanupWords(request: any) {
  const resp = await request.get(`${API_URL}/me/vocabulary/words?limit=100`, { headers: HEADERS })
  if (resp.ok()) {
    const data = await resp.json()
    for (const w of data.items ?? []) {
      await request.delete(`${API_URL}/me/vocabulary/words/${w.id}`, { headers: HEADERS })
    }
  }
}

test.describe.serial('Vocabulary page (merged Words + Practice)', () => {
  test.beforeAll(async ({ request }) => {
    await testLogin(request)
    await cleanupWords(request)
    // Save test words so all subsequent tests have data
    for (const w of TEST_WORDS) {
      const resp = await request.post(`${API_URL}/me/vocabulary/words`, { headers: HEADERS, data: w })
      if (!resp.ok()) throw new Error(`Failed to save word ${w.word}: ${resp.status()}`)
    }
  })

  test('vocabulary page loads with stats', async ({ authedPage: page }) => {
    await page.goto('/en/vocabulary/')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.vocab-page')).toBeVisible()

    // Stats bar should show total words
    const statValue = page.locator('.vocab-stat__value').first()
    await expect(statValue).toBeVisible({ timeout: 10000 })

    // Practice button should be enabled
    const startBtn = page.locator('.practice-page__start-btn')
    await expect(startBtn).toBeEnabled()
    await expect(startBtn).toContainText('words')
  })

  test('flashcards is default mode', async ({ authedPage: page }) => {
    await page.goto('/en/vocabulary/')
    await page.evaluate(() => localStorage.removeItem('practiceMode'))
    await page.reload()
    await page.waitForLoadState('networkidle')

    const flashcardsBtn = page.locator('.vocab-mode-toggle__btn--active')
    await expect(flashcardsBtn).toContainText('Flashcards')
  })

  test('flashcards listed first in mode toggle', async ({ authedPage: page }) => {
    await page.goto('/en/vocabulary/')
    await page.waitForLoadState('networkidle')

    const buttons = page.locator('.vocab-mode-toggle__btn')
    await expect(buttons.nth(0)).toContainText('Flashcards')
    await expect(buttons.nth(1)).toContainText('Blitz')
  })

  test('streak badge shows in header when words due', async ({ authedPage: page }) => {
    await page.goto('/en/vocabulary/')
    await page.waitForLoadState('networkidle')

    const badge = page.locator('[data-testid="streak-badge"]')
    await expect(badge).toBeVisible()
  })

  test('start review session in flashcard mode', async ({ authedPage: page }) => {
    await page.goto('/en/vocabulary/')
    await page.waitForLoadState('networkidle')

    const startBtn = page.locator('.practice-page__start-btn')
    await startBtn.click()

    await page.waitForURL(/\/vocabulary\/review/)
    await expect(page.locator('.review-progress')).toBeVisible()
  })

  test('legacy /practice redirects to /vocabulary', async ({ authedPage: page }) => {
    await page.goto('/en/practice/')
    await page.waitForURL(/\/en\/vocabulary\/?$/)
    await expect(page.locator('.vocab-page')).toBeVisible()
  })

  test('legacy /words redirects to /vocabulary', async ({ authedPage: page }) => {
    await page.goto('/en/words/')
    await page.waitForURL(/\/en\/vocabulary\/?$/)
    await expect(page.locator('.vocab-page')).toBeVisible()
  })

  // Cleanup
  test.afterAll(async ({ request }) => {
    await testLogin(request)
    await cleanupWords(request)
  })
})
