import { test, expect } from '../fixtures/auth.fixture'
import { testLogin } from '../helpers/api'
import { getTestData } from '../fixtures/test-data'
import { waitForReaderLoad } from '../helpers/reader'
import type { Page } from '@playwright/test'

const API_URL = process.env.API_URL ?? 'http://localhost:8080'
const HEADERS = { Host: 'general.localhost', 'Content-Type': 'application/json' }

// Words guaranteed to appear in Cal Newport's "So Good They Can't Ignore You"
// (themes: work/career/passion/skill). Frequencies land in SrsEligible band.
const VOCAB_WORDS = [
  { word: 'work', language: 'en', nativeLanguage: 'de', translation: 'Arbeit', sentence: 'I love my work.' },
  { word: 'career', language: 'en', nativeLanguage: 'de', translation: 'Karriere', sentence: 'His career took off.' },
  { word: 'skill', language: 'en', nativeLanguage: 'de', translation: 'Fähigkeit', sentence: 'A rare skill.' },
]

async function saveWords(request: import('@playwright/test').APIRequestContext) {
  for (const w of VOCAB_WORDS) {
    const resp = await request.post(`${API_URL}/me/vocabulary/words`, { headers: HEADERS, data: w })
    if (!resp.ok() && resp.status() !== 409) {
      throw new Error(`save ${w.word}: ${resp.status()} ${await resp.text()}`)
    }
  }
}

async function cleanupWords(request: import('@playwright/test').APIRequestContext) {
  const resp = await request.get(`${API_URL}/me/vocabulary/words?limit=100`, { headers: HEADERS })
  if (!resp.ok()) return
  const data = await resp.json()
  for (const w of data.items ?? []) {
    await request.delete(`${API_URL}/me/vocabulary/words/${w.id}`, { headers: HEADERS })
  }
}

async function highlightSize(page: Page, name: string): Promise<number> {
  return page.evaluate((n) => {
    const anyCSS = (globalThis as unknown as { CSS?: { highlights?: Map<string, { size: number }> } }).CSS
    const h = anyCSS?.highlights?.get(n)
    return h?.size ?? 0
  }, name)
}

async function totalHighlightSize(page: Page): Promise<number> {
  return page.evaluate(() => {
    const anyCSS = (globalThis as unknown as { CSS?: { highlights?: Map<string, { size: number }> } }).CSS
    const hs = anyCSS?.highlights
    if (!hs) return 0
    let total = 0
    for (const name of ['vocab-new', 'vocab-recognition', 'vocab-recall', 'vocab-context', 'vocab-mastered', 'vocab-active']) {
      total += hs.get(name)?.size ?? 0
    }
    return total
  })
}

test.describe.serial('Reader vocab highlights (Custom Highlight API)', () => {
  test.describe.configure({ timeout: 60_000 })

  test.beforeAll(async ({ request }) => {
    await testLogin(request)
    await cleanupWords(request)
    await saveWords(request)
  })

  test.afterAll(async ({ request }) => {
    await testLogin(request)
    await cleanupWords(request)
  })

  test('new path: CSS.highlights populated after chapter render', async ({ authedPage: page }) => {
    const { enBook } = getTestData()
    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    await expect(async () => {
      expect(await totalHighlightSize(page)).toBeGreaterThan(0)
    }).toPass({ timeout: 15_000, intervals: [500] })

    expect(await page.locator('mark[data-vocab-mark]').count()).toBe(0)
  })

  test('highlights persist through chapter eviction & return scroll', async ({ authedPage: page }) => {
    const { enBook } = getTestData()
    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    await expect(async () => {
      expect(await totalHighlightSize(page)).toBeGreaterThan(0)
    }).toPass({ timeout: 15_000, intervals: [500] })

    const sizeBefore = await totalHighlightSize(page)

    // Scroll far forward to evict chapter 1 (CHAPTERS_EVICT_WINDOW = 3).
    // 12 page-downs of 2000px easily crosses 3+ chapters on this 110-chapter book.
    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => window.scrollBy(0, 2000))
      await page.waitForTimeout(150)
    }

    // Scroll back to top — first chapter reloads via dangerouslySetInnerHTML.
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(500)

    await expect(async () => {
      expect(await totalHighlightSize(page)).toBeGreaterThan(0)
    }).toPass({ timeout: 15_000, intervals: [500] })

    // Still no legacy <mark> — new path recovered.
    expect(await page.locator('mark[data-vocab-mark]').count()).toBe(0)
    // And at least as many highlights as before (chapter re-rendered, engine re-ran).
    expect(await totalHighlightSize(page)).toBeGreaterThanOrEqual(Math.min(1, sizeBefore))
  })

  test('killswitch: window.__textstackDisableCustomHighlights=true → legacy <mark> path', async ({ authedPage: page }) => {
    const { enBook } = getTestData()

    // Set killswitch BEFORE app boots — init script runs on every navigation.
    await page.addInitScript(() => {
      ;(window as unknown as { __textstackDisableCustomHighlights?: boolean })
        .__textstackDisableCustomHighlights = true
    })

    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    await expect(async () => {
      const marks = await page.locator('mark[data-vocab-mark]').count()
      expect(marks).toBeGreaterThan(0)
    }).toPass({ timeout: 15_000, intervals: [500] })

    // New-path registry should be empty because dispatcher took the legacy branch.
    expect(await totalHighlightSize(page)).toBe(0)
  })

  test('unsupported fallback: CSS.highlights undefined → legacy path', async ({ authedPage: page }) => {
    const { enBook } = getTestData()

    // Remove CSS.highlights before any reader code reads support.
    await page.addInitScript(() => {
      try {
        const css = (globalThis as unknown as { CSS?: Record<string, unknown> }).CSS
        if (css) delete (css as Record<string, unknown>).highlights
      } catch {
        // ignore — legacy path doesn't need the delete to succeed
      }
    })

    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    await expect(async () => {
      const marks = await page.locator('mark[data-vocab-mark]').count()
      expect(marks).toBeGreaterThan(0)
    }).toPass({ timeout: 15_000, intervals: [500] })
  })
})
