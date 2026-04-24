import { test, expect } from '../fixtures/auth.fixture'
import { getTestData } from '../fixtures/test-data'
import { waitForReaderLoad } from '../helpers/reader'
import type { Page } from '@playwright/test'

const API_URL = process.env.API_URL ?? 'http://localhost:8080'
const HEADERS = { Host: 'general.localhost', 'Content-Type': 'application/json' }

async function cleanupWords(request: import('@playwright/test').APIRequestContext) {
  const resp = await request.get(`${API_URL}/me/vocabulary/words?limit=200`, { headers: HEADERS })
  if (!resp.ok()) return
  const data = await resp.json()
  for (const w of data.items ?? []) {
    await request.delete(`${API_URL}/me/vocabulary/words/${w.id}`, { headers: HEADERS })
  }
}

// Pick a 4-10 letter alphabetic word from the rendered reader content. Dynamic
// extraction is more reliable than hard-coding words — the first chapter of any
// test book might be "welcome"/"dedication"/etc with arbitrary vocabulary.
async function pickWordFromReader(page: Page): Promise<string> {
  const word = await page.evaluate(() => {
    const el = document.getElementById('reader-content') ||
               document.querySelector('.reader-main') ||
               document.body
    const text = (el?.textContent ?? '').toLowerCase()
    // Prefer 5-8 letter words; lands comfortably in SrsEligible Zipf band.
    const matches = text.match(/[a-z]{5,8}/g) ?? []
    // Skip the shortest/most generic frontmatter boilerplate words.
    for (const m of matches) {
      if (['about', 'chapter', 'title', 'cover', 'copyright'].includes(m)) continue
      return m
    }
    return matches[0] ?? null
  })
  if (!word) throw new Error('Could not find a candidate word in reader content')
  return word
}

async function saveWord(request: import('@playwright/test').APIRequestContext, word: string) {
  const resp = await request.post(`${API_URL}/me/vocabulary/words`, {
    headers: HEADERS,
    data: { word, language: 'en', nativeLanguage: 'de', translation: 'X', sentence: `A ${word} example.` },
  })
  if (!resp.ok() && resp.status() !== 409) {
    throw new Error(`save ${word}: ${resp.status()} ${await resp.text()}`)
  }
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
  test.describe.configure({ timeout: 90_000 })

  // Can't use ({ request }) here — that's a fresh, unauthed context per test.
  // page.request (inside tests) shares cookies with authedPage's storage state.

  // This file targets the pre-v2 dispatcher cascade (CSS.highlights → <mark>
  // fallback). v2 overlay (default-on) bypasses that cascade entirely and
  // routes vocab to VocabOverlayLayer (SVG). Force-legacy mode for all tests
  // in this describe so the cascade under test is exercised. Removed with
  // VocabHighlightLayer / VocabWordLayer in slice 10.
  test.beforeEach(async ({ authedPage: page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('textstack.readerOverlayV2', '0')
    })
  })

  test('new path: CSS.highlights populated after chapter render', async ({ authedPage: page }) => {
    const { enBook } = getTestData()
    await cleanupWords(page.request)

    // First navigation — so we can pull a real word out of the rendered chapter.
    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    const word = await pickWordFromReader(page)
    await saveWord(page.request, word)

    // Reload to re-fetch vocab map with the new word.
    await page.reload()
    await waitForReaderLoad(page)

    await expect(async () => {
      expect(await totalHighlightSize(page)).toBeGreaterThan(0)
    }).toPass({ timeout: 20_000, intervals: [500] })

    // New-path verified: no legacy <mark> wrappers injected.
    expect(await page.locator('mark[data-vocab-mark]').count()).toBe(0)
    await cleanupWords(page.request)
  })

  test('highlights persist through scroll & return', async ({ authedPage: page }) => {
    const { enBook } = getTestData()
    await cleanupWords(page.request)

    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)
    const word = await pickWordFromReader(page)
    await saveWord(page.request, word)
    await page.reload()
    await waitForReaderLoad(page)

    await expect(async () => {
      expect(await totalHighlightSize(page)).toBeGreaterThan(0)
    }).toPass({ timeout: 20_000, intervals: [500] })

    // Scroll forward aggressively to trigger eviction of chapter 1.
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollBy(0, 2500))
      await page.waitForTimeout(200)
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(500)

    // After return scroll, the engine should re-populate highlights on the
    // re-rendered chapter 1 (mutation observer recovery path).
    await expect(async () => {
      expect(await totalHighlightSize(page)).toBeGreaterThan(0)
    }).toPass({ timeout: 20_000, intervals: [500] })
    expect(await page.locator('mark[data-vocab-mark]').count()).toBe(0)
    await cleanupWords(page.request)
  })

  test('killswitch → legacy <mark> path', async ({ authedPage: page }) => {
    const { enBook } = getTestData()
    await cleanupWords(page.request)

    // Navigate once to pick a word, then set killswitch and re-navigate.
    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)
    const word = await pickWordFromReader(page)
    await saveWord(page.request, word)

    await page.addInitScript(() => {
      ;(window as unknown as { __textstackDisableCustomHighlights?: boolean })
        .__textstackDisableCustomHighlights = true
    })
    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    await expect(async () => {
      const marks = await page.locator('mark[data-vocab-mark]').count()
      expect(marks).toBeGreaterThan(0)
    }).toPass({ timeout: 20_000, intervals: [500] })

    // Dispatcher took legacy — custom-highlight registry stays empty.
    expect(await totalHighlightSize(page)).toBe(0)
    await cleanupWords(page.request)
  })

  test('unsupported (CSS.highlights undefined) → legacy path', async ({ authedPage: page }) => {
    const { enBook } = getTestData()
    await cleanupWords(page.request)

    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)
    const word = await pickWordFromReader(page)
    await saveWord(page.request, word)

    await page.addInitScript(() => {
      try {
        const css = (globalThis as unknown as { CSS?: Record<string, unknown> }).CSS
        if (css) delete (css as Record<string, unknown>).highlights
      } catch {
        /* ignore — fallback doesn't depend on the delete succeeding */
      }
    })
    await page.goto(`/en/books/${enBook.slug}/${enBook.firstChapterSlug}`)
    await waitForReaderLoad(page)

    await expect(async () => {
      const marks = await page.locator('mark[data-vocab-mark]').count()
      expect(marks).toBeGreaterThan(0)
    }).toPass({ timeout: 20_000, intervals: [500] })
    await cleanupWords(page.request)
  })
})
