import { test, expect } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'https://textstack.app'
const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

async function getHeaders(url: string, ua?: string) {
  const headers: Record<string, string> = {}
  if (ua) headers['User-Agent'] = ua
  const resp = await fetch(url, { method: 'HEAD', headers, redirect: 'follow' })
  return resp.headers
}

test.describe('SEO headers — noindex must NOT appear on public pages', () => {
  const publicPages = [
    '/en/',
    '/en/books/',
    '/en/authors/',
    '/en/genres/',
    '/en/blog/',
    '/en/about/',
  ]

  for (const path of publicPages) {
    test(`${path} — no noindex for regular user`, async () => {
      const h = await getHeaders(`${BASE}${path}`)
      const robots = h.get('x-robots-tag') ?? ''
      expect(robots).not.toContain('noindex')
    })

    test(`${path} — no noindex for Googlebot`, async () => {
      const h = await getHeaders(`${BASE}${path}`, BOT_UA)
      const robots = h.get('x-robots-tag') ?? ''
      expect(robots).not.toContain('noindex')
    })
  }

  test('/en/ — bot gets SSG render', async () => {
    const h = await getHeaders(`${BASE}/en/`, BOT_UA)
    expect(h.get('x-seo-render')).toBe('ssg')
  })

  test('/en/ — user gets SPA render', async () => {
    const h = await getHeaders(`${BASE}/en/`)
    expect(h.get('x-seo-render')).toBe('spa')
  })

  test('www redirects to non-www', async () => {
    const resp = await fetch('https://www.textstack.app/', { redirect: 'manual' })
    expect(resp.status).toBe(301)
    expect(resp.headers.get('location')).toContain('textstack.app')
    expect(resp.headers.get('location')).not.toContain('www')
  })
})
