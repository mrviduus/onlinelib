#!/usr/bin/env node
// Bench the reader overlay: initial paint, redraw on font change, scroll FPS.
//
// Targets (from PLAN imperative-stirring-summit.md):
//   initial overlay render (300 annotations) <15ms
//   reflow on font change                    <10ms
//   scroll FPS (500 vocab words)             60 sustained
//
// Run: pnpm -C apps/web bench:reader-overlay
// Requires: docker stack up (api on :8080, web on :5173) and
// pnpm test:e2e to have run once so .auth/user.json + .test-data.json exist.

import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(__dirname, '..')
const baseURL = process.env.BASE_URL ?? 'http://localhost:5173'
const apiURL = process.env.API_URL ?? 'http://localhost:8080'
const HEADERS = { Host: 'general.localhost', 'Content-Type': 'application/json' }

const VOCAB_COUNT = Number(process.env.VOCAB_COUNT ?? 500)
const SCROLL_SECONDS = 5

async function loadAuthState() {
  const raw = await readFile(resolve(webRoot, 'e2e/.auth/user.json'), 'utf8')
  return JSON.parse(raw)
}

async function loadTestData() {
  const raw = await readFile(resolve(webRoot, 'e2e/.test-data.json'), 'utf8')
  return JSON.parse(raw)
}

// Pull words from the rendered chapter so saved entries actually match
// content. Using random strings would inflate `reader.overlay.miss` and skew
// the scroll bench (no rects to redraw).
async function pickWordsFromReader(page, count) {
  return page.evaluate((n) => {
    const el = document.getElementById('reader-content') || document.body
    const text = (el.textContent ?? '').toLowerCase()
    const seen = new Set()
    const skip = new Set(['about', 'chapter', 'title', 'cover', 'copyright', 'the', 'and'])
    for (const m of text.match(/[a-z]{4,10}/g) ?? []) {
      if (skip.has(m)) continue
      seen.add(m)
      if (seen.size >= n) break
    }
    return [...seen]
  }, count)
}

async function saveWords(authToken, words) {
  const headers = { ...HEADERS, Authorization: `Bearer ${authToken}` }
  let saved = 0
  for (const word of words) {
    const r = await fetch(`${apiURL}/me/vocabulary/words`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        word,
        language: 'en',
        nativeLanguage: 'en',
        translation: word,
        sentence: `bench ${word}.`,
      }),
    })
    if (r.ok || r.status === 409) saved++
  }
  return saved
}

async function deleteAllWords(authToken) {
  const headers = { ...HEADERS, Authorization: `Bearer ${authToken}` }
  const r = await fetch(`${apiURL}/me/vocabulary/words?limit=1000`, { headers })
  if (!r.ok) return
  const { items = [] } = await r.json()
  for (const w of items) {
    await fetch(`${apiURL}/me/vocabulary/words/${w.id}`, { method: 'DELETE', headers })
  }
}

function tokenFromAuth(state) {
  const cookie = state.cookies?.find?.((c) => c.name === 'access_token')
  return cookie?.value ?? null
}

async function measureFirstOverlayPaint(page, url) {
  const start = Date.now()
  await page.goto(url)
  await page.waitForSelector('svg[data-reader-overlay="true"]', { timeout: 30_000 })
  // First non-empty paint — overlay mounts before annotations are reconciled.
  await page.waitForFunction(
    () => {
      const svgs = document.querySelectorAll('svg[data-reader-overlay="true"]')
      for (const s of svgs) if (s.querySelector('g')) return true
      return false
    },
    { timeout: 30_000 },
  )
  return Date.now() - start
}

async function measureRedraw(page) {
  return page.evaluate(() => {
    const root = document.documentElement
    const before = root.style.fontSize
    const t0 = performance.now()
    root.style.fontSize = '22px'
    // Force layout flush.
    void root.offsetHeight
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const dt = performance.now() - t0
          root.style.fontSize = before
          resolve(dt)
        })
      })
    })
  })
}

async function measureScrollFps(page, durationSec) {
  return page.evaluate(async (sec) => {
    const ticks = []
    let last = performance.now()
    let raf = 0
    const loop = (now) => {
      ticks.push(now - last)
      last = now
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    const t0 = performance.now()
    const totalScroll = document.documentElement.scrollHeight - window.innerHeight
    const stepPx = Math.max(2, Math.floor(totalScroll / (sec * 60)))
    while (performance.now() - t0 < sec * 1000) {
      window.scrollBy(0, stepPx)
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) {
        window.scrollTo(0, 0)
      }
      await new Promise((r) => requestAnimationFrame(r))
    }
    cancelAnimationFrame(raf)
    if (ticks.length < 2) return { fps: 0, samples: ticks.length }
    const avgFrameMs = ticks.reduce((a, b) => a + b, 0) / ticks.length
    return { fps: 1000 / avgFrameMs, samples: ticks.length }
  }, durationSec)
}

function fmt(n) {
  return n.toFixed(1)
}

async function main() {
  console.log(`[bench] base=${baseURL} api=${apiURL} vocab=${VOCAB_COUNT}`)

  const [authState, testData] = await Promise.all([loadAuthState(), loadTestData()])
  const token = tokenFromAuth(authState)
  if (!token) {
    console.error('[bench] no access_token cookie in e2e/.auth/user.json — run E2E setup first')
    process.exit(2)
  }

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ storageState: resolve(webRoot, 'e2e/.auth/user.json') })
  const page = await ctx.newPage()

  const url = `${baseURL}/en/books/${testData.enBook.slug}/${testData.enBook.firstChapterSlug}`

  console.log(`[bench] cold open + word pick…`)
  await page.goto(url)
  await page.waitForSelector('#reader-content', { timeout: 30_000 })
  const words = await pickWordsFromReader(page, VOCAB_COUNT)
  console.log(`[bench] picked ${words.length} candidate words`)

  console.log(`[bench] saving vocab via API…`)
  await deleteAllWords(token)
  const saved = await saveWords(token, words)
  console.log(`[bench] saved ${saved} words`)

  try {
    console.log(`[bench] measuring initial overlay paint…`)
    const initialMs = await measureFirstOverlayPaint(page, url)

    console.log(`[bench] measuring redraw on font-size change…`)
    const redrawMs = await measureRedraw(page)

    console.log(`[bench] measuring scroll FPS (${SCROLL_SECONDS}s)…`)
    const { fps, samples } = await measureScrollFps(page, SCROLL_SECONDS)

    console.log('\n=== bench-reader-overlay ===')
    console.log(`vocab words saved        : ${saved}`)
    console.log(`initial overlay paint    : ${fmt(initialMs)} ms   (target: <15 for 300)`)
    console.log(`redraw on font change    : ${fmt(redrawMs)} ms   (target: <10)`)
    console.log(`scroll FPS (avg, ${samples} f) : ${fmt(fps)}        (target: 60)`)
    console.log('============================\n')
  } finally {
    console.log('[bench] cleaning vocab…')
    await deleteAllWords(token)
    await browser.close()
  }
}

main().catch((err) => {
  console.error('[bench] failed:', err)
  process.exit(1)
})
