import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface BookTestData {
  editionId: string
  slug: string
  title: string
  chapterCount: number
  firstChapterSlug: string
  secondChapterSlug: string
}

export interface TestData {
  enBook: BookTestData
  siteId: string
}

let cached: TestData | null = null

export function getTestData(): TestData {
  if (cached) return cached
  const dataPath = path.resolve(__dirname, '../.test-data.json')
  const parsed = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))

  // The interface says enBook is required; the file is written by global-setup and
  // may not contain it — when /books is unreachable or holds no English book, setup
  // writes `{ siteId: '' }` and warns. The type then lies, and the first test to
  // touch it dies on "Cannot read properties of undefined (reading 'slug')", several
  // frames from the cause.
  //
  // Same shape as the other silent fallbacks found today. Name the precondition here,
  // where it is still legible.
  if (!parsed?.enBook?.slug) {
    throw new Error(
      'No English test book in .test-data.json. global-setup discovers books via ' +
        'GET /books?limit=20 — it does not create them. Check the API is reachable and ' +
        'the test database actually has a published English book.',
    )
  }
  if (!parsed.enBook.firstChapterSlug) {
    throw new Error(
      `Test book "${parsed.enBook.slug}" has no chapters in .test-data.json. ` +
        'GET /books/{slug} returned no chapter list — the book may still be ingesting.',
    )
  }

  cached = parsed
  return cached!
}
