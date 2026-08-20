import { test, expect } from '../fixtures/auth.fixture'
import { testLogin } from '../helpers/api'

const API_URL = process.env.API_URL ?? 'http://localhost:8080'
const HEADERS = { Host: 'general.localhost', 'Content-Type': 'application/json' }

// Keep these in the top-5k Zipf band so F1 frequency filter classifies them
// as SrsEligible — rare words route to WordLookup and never populate the SRS
// list the page asserts against.
const TEST_WORDS = [
  { word: 'happy', language: 'en', nativeLanguage: 'de', translation: 'glücklich', sentence: 'She was happy about the news.' },
  { word: 'music', language: 'en', nativeLanguage: 'de', translation: 'Musik', sentence: 'He enjoys listening to music.' },
  { word: 'garden', language: 'en', nativeLanguage: 'de', translation: 'Garten', sentence: 'The garden is full of flowers.' },
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

  test('flashcards is default mode', async ({ authedPage: page }) => {
    await page.goto('/en/vocabulary/')
    await page.evaluate(() => localStorage.removeItem('practiceMode'))
    await page.reload()
    await page.waitForLoadState('networkidle')

    const flashcardsBtn = page.locator('.vocab-mode-toggle__btn--active')
    await expect(flashcardsBtn).toContainText('Flashcards')
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

  // Cleanup
  test.afterAll(async ({ request }) => {
    await testLogin(request)
    await cleanupWords(request)
  })
})
