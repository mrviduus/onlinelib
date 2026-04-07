import { test, expect } from '../fixtures/auth.fixture'
import { saveTestWords, deleteAllTestWords } from '../helpers/vocabulary'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH_FILE = path.resolve(__dirname, '../.auth/user.json')

test.describe('TTS', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH_FILE })
    await deleteAllTestWords(ctx.request)
    await saveTestWords(ctx.request)
    await ctx.close()
  })

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH_FILE })
    await deleteAllTestWords(ctx.request)
    await ctx.close()
  })

  test('vocabulary page has speak buttons', async ({ authedPage: page }) => {
    await page.goto('/en/words')
    await page.waitForLoadState('networkidle')

    const speakBtns = page.locator('.vocab-word .speak-btn')
    expect(await speakBtns.count()).toBeGreaterThan(0)
  })

  test('speak button click triggers TTS API call', async ({ authedPage: page }) => {
    await page.goto('/en/words')
    await page.waitForLoadState('networkidle')

    // Listen for TTS API request
    const ttsPromise = page.waitForRequest(
      req => req.url().includes('/api/tts') && !req.url().includes('/voices'),
      { timeout: 10000 }
    )

    // Click the first speak button
    const speakBtn = page.locator('.vocab-word .speak-btn').first()
    await expect(speakBtn).toBeVisible()
    await speakBtn.click()

    // Verify TTS API was called
    const ttsReq = await ttsPromise
    expect(ttsReq.url()).toContain('text=')
    expect(ttsReq.url()).toContain('lang=')
  })

  test('review cards have speak buttons', async ({ authedPage: page }) => {
    await page.goto('/en/words/review')
    await page.waitForLoadState('networkidle')

    // Wait for cards to load from API
    const cardOrNewWord = page.locator('.review-mc__prompt, .new-word-card__continue, .speak-btn')
    await expect(cardOrNewWord.first()).toBeVisible({ timeout: 10_000 })

    // Dismiss NewWordCard if visible (new words show intro first)
    const continueBtn = page.locator('.new-word-card__continue')
    if (await continueBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await continueBtn.click()
      await page.waitForTimeout(300)
    }

    // Should see a speak button on the card (MC or FlashCard)
    const speakBtn = page.locator('.speak-btn')
    await expect(speakBtn).toBeVisible({ timeout: 5000 })
  })

  test('review feedback has speak button', async ({ authedPage: page }) => {
    await page.goto('/en/words/review')
    await page.waitForLoadState('networkidle')

    // Wait for cards to load from API
    const cardOrNewWord = page.locator('.review-mc__prompt, .new-word-card__continue')
    await expect(cardOrNewWord.first()).toBeVisible({ timeout: 10_000 })

    // Dismiss NewWordCard if visible
    const continueBtn = page.locator('.new-word-card__continue')
    if (await continueBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await continueBtn.click()
      await page.waitForTimeout(300)
    }

    // Answer the card (MC: click first option)
    const mcOption = page.locator('.review-mc__option').first()
    await expect(mcOption).toBeVisible({ timeout: 5000 })
    await mcOption.click()

    // Wait for feedback
    await page.waitForTimeout(500)

    // Feedback should have a speak button
    const feedbackSpeak = page.locator('.review-feedback .speak-btn')
    await expect(feedbackSpeak).toBeVisible({ timeout: 3000 })
  })

  test('TTS API returns valid audio', async ({ authedPage: page }) => {
    // Direct API test via page context
    const response = await page.request.get(
      'http://localhost:8080/api/tts?text=hello&lang=en',
      { headers: { Host: 'general.localhost' } }
    )

    // Edge TTS might be unreachable in CI
    if (response.status() === 502) return

    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('audio/mpeg')

    const body = await response.body()
    expect(body.length).toBeGreaterThan(100)
  })

  test('TTS voices API returns voices', async ({ authedPage: page }) => {
    const response = await page.request.get(
      'http://localhost:8080/api/tts/voices?lang=en',
      { headers: { Host: 'general.localhost' } }
    )

    if (response.status() === 502) return

    expect(response.status()).toBe(200)
    const voices = await response.json()
    expect(voices.length).toBeGreaterThan(0)
    expect(voices[0]).toHaveProperty('shortName')
  })
})
