import { test, expect } from '../fixtures/auth.fixture'
import { adminLogin, uploadBook, waitForIngestion, getEdition } from '../helpers/api'
import { waitForReaderLoad } from '../helpers/reader'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API_URL = process.env.API_URL ?? 'http://localhost:8080'

let bookSlug: string
let chapterSlug: string
let editionId: string
let adminAvailable = true

test.describe('Inline images in reader', () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext()
    const request = ctx.request

    // Admin login — skip all tests if admin not available (e.g. CI)
    try {
      await adminLogin(request)
    } catch {
      adminAvailable = false
      await ctx.close()
      return
    }

    // Get site info for siteId, author, genre.
    //
    // This read `${API_URL}/site` and `site.id`, and both were wrong: the API exposes
    // `/site/context` (and `/site/language`), and the payload field is `siteId`. The
    // dead route returned an empty 404 body, so `.json()` threw "Unexpected end of
    // JSON input" — a parse error pointing at the wrong line, several steps from the
    // cause. Nobody noticed because admin login was failing in CI and this whole spec
    // skipped on every run.
    //
    // Status checked explicitly so the next time a route moves, the failure says 404.
    const siteResp = await request.get(`${API_URL}/site/context`, {
      headers: { Host: 'general.localhost' },
    })
    if (!siteResp.ok()) {
      throw new Error(`GET /site/context failed: ${siteResp.status()}`)
    }
    const site = await siteResp.json()
    const siteId = site.siteId

    // Create the author and genre this spec needs rather than hoping the database
    // already has some.
    //
    // The previous version read the first row of /admin/authors and fell back to
    // `?? ''` when there was none — and a fresh CI database has none. The empty
    // string then surfaced three steps later as
    // `upload failed: 400 {"error":"At least one author is required"}`, which
    // describes the symptom and not the cause. Same shape as the dead /site route
    // above: a silent fallback converting a clear precondition into a confusing
    // downstream error.
    //
    // POST /admin/authors is get-or-create (its response carries `isNew`), so this
    // is safe to run against a warm volume as well as an empty one.
    const createRef = async (kind: 'authors' | 'genres', name: string): Promise<string> => {
      const resp = await request.post(`${API_URL}/admin/${kind}`, {
        headers: { Host: 'general.localhost' },
        data: { siteId, name },
      })
      if (!resp.ok()) {
        throw new Error(`POST /admin/${kind} failed: ${resp.status()} ${await resp.text()}`)
      }
      const body = await resp.json()
      if (!body.id) throw new Error(`POST /admin/${kind} returned no id: ${JSON.stringify(body)}`)
      return body.id
    }

    const authorId = await createRef('authors', 'E2E Image Fixture Author')
    const genreId = await createRef('genres', 'E2E Image Fixture Genre')

    // Upload test EPUB with image
    const epubPath = path.resolve(__dirname, '../fixtures/test-book-images.epub')
    const result = await uploadBook(request, {
      filePath: epubPath,
      title: 'Test Book With Images',
      language: 'en',
      siteId,
      authorIds: authorId,
      genreId,
    })

    // Wait for ingestion
    const jobId = result.jobId ?? result.ingestionJobId
    await waitForIngestion(request, jobId)

    // Publish the edition
    editionId = result.editionId
    await request.post(`${API_URL}/admin/editions/${editionId}/publish`, {
      headers: { Host: 'general.localhost' },
    })

    // Get book detail to find slug + chapter slug
    const edition = await getEdition(request, editionId)
    bookSlug = edition.slug
    chapterSlug = edition.chapters?.[0]?.slug ?? ''

    await ctx.close()
  })

  test('chapter with inline images shows img elements that load', async ({ authedPage: page }) => {
    test.skip(!adminAvailable, 'admin login not available')
    await page.goto(`/en/books/${bookSlug}/${chapterSlug}`)
    await waitForReaderLoad(page)

    // Find images in reader content (pagination or scroll mode)
    const images = page.locator('.reader-content img, .scroll-reader__chapter img')
    await expect(images.first()).toBeVisible({ timeout: 10_000 })

    const count = await images.count()
    expect(count).toBeGreaterThan(0)

    // Verify src points to asset endpoint
    const src = await images.first().getAttribute('src')
    expect(src).toMatch(/\/books\/[a-f0-9-]+\/assets\/[a-f0-9-]+/)

    // Verify image actually loaded (naturalWidth > 0)
    const naturalWidth = await images.first().evaluate((el: HTMLImageElement) => el.naturalWidth)
    expect(naturalWidth).toBeGreaterThan(0)
  })

  test('image asset endpoint returns 200 with image content-type', async ({ authedPage: page }) => {
    test.skip(!adminAvailable, 'admin login not available')
    // Fetch chapter HTML from API to get img src
    const chapterResp = await page.request.get(`${API_URL}/books/${bookSlug}/chapters/${chapterSlug}`, {
      headers: { Host: 'general.localhost' },
    })
    expect(chapterResp.ok()).toBeTruthy()

    const chapter = await chapterResp.json()
    const html: string = chapter.html ?? chapter.content ?? ''

    // Extract img src from HTML
    const srcMatch = html.match(/src="(\/books\/[^"]+)"/)
    expect(srcMatch).not.toBeNull()

    const assetUrl = `${API_URL}${srcMatch![1]}`
    const assetResp = await page.request.get(assetUrl, {
      headers: { Host: 'general.localhost' },
    })

    expect(assetResp.status()).toBe(200)
    const contentType = assetResp.headers()['content-type']
    expect(contentType).toMatch(/^image\//)
  })
})
