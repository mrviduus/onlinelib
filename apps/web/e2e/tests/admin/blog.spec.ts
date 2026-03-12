import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const authFile = path.resolve(__dirname, '../../.auth/admin.json')

const API_URL = process.env.API_URL ?? 'http://localhost:8080'
const SITE_ID = '11111111-1111-1111-1111-111111111111'
const ADMIN_HEADERS = { Host: 'textstack.dev', 'Content-Type': 'application/json' }

function hasAdminAuth(): boolean {
  try {
    const data = JSON.parse(fs.readFileSync(authFile, 'utf-8'))
    return data.cookies?.length > 0
  } catch {
    return false
  }
}

test.use({ storageState: authFile })

test.describe('Admin Blog endpoints with siteId query param', () => {
  test.describe.configure({ mode: 'serial' })

  let createdPostId: string

  test.beforeEach(() => {
    test.skip(!hasAdminAuth(), 'Admin auth not configured')
  })

  test('GET /admin/blog — list posts with siteId', async ({ request }) => {
    const resp = await request.get(`${API_URL}/admin/blog?siteId=${SITE_ID}`, {
      headers: ADMIN_HEADERS,
    })
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(body).toHaveProperty('total')
    expect(body).toHaveProperty('items')
  })

  test('GET /admin/blog/stats — stats with siteId', async ({ request }) => {
    const resp = await request.get(`${API_URL}/admin/blog/stats?siteId=${SITE_ID}`, {
      headers: ADMIN_HEADERS,
    })
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(body).toHaveProperty('total')
    expect(body).toHaveProperty('published')
    expect(body).toHaveProperty('draft')
  })

  test('POST /admin/blog — create post with siteId', async ({ request }) => {
    const resp = await request.post(`${API_URL}/admin/blog?siteId=${SITE_ID}`, {
      headers: ADMIN_HEADERS,
      data: {
        title: 'E2E Test Blog Post',
        content: '<p>Test content for E2E</p>',
        language: 'en',
        authorName: 'E2E Test',
      },
    })
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(body.title).toBe('E2E Test Blog Post')
    expect(body.id).toBeTruthy()
    createdPostId = body.id
  })

  test('GET /admin/blog/:id — get post with siteId', async ({ request }) => {
    test.skip(!createdPostId, 'No post created')
    const resp = await request.get(`${API_URL}/admin/blog/${createdPostId}?siteId=${SITE_ID}`, {
      headers: ADMIN_HEADERS,
    })
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(body.title).toBe('E2E Test Blog Post')
  })

  test('PUT /admin/blog/:id — update post with siteId', async ({ request }) => {
    test.skip(!createdPostId, 'No post created')
    const resp = await request.put(`${API_URL}/admin/blog/${createdPostId}?siteId=${SITE_ID}`, {
      headers: ADMIN_HEADERS,
      data: {
        title: 'E2E Updated Blog Post',
        content: '<p>Updated content</p>',
        language: 'en',
        authorName: 'E2E Test',
      },
    })
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(body.title).toBe('E2E Updated Blog Post')
  })

  test('POST /admin/blog/:id/publish — publish with siteId', async ({ request }) => {
    test.skip(!createdPostId, 'No post created')
    const resp = await request.post(`${API_URL}/admin/blog/${createdPostId}/publish?siteId=${SITE_ID}`, {
      headers: ADMIN_HEADERS,
    })
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(body.status).toBe('Published')
  })

  test('POST /admin/blog/:id/unpublish — unpublish with siteId', async ({ request }) => {
    test.skip(!createdPostId, 'No post created')
    const resp = await request.post(`${API_URL}/admin/blog/${createdPostId}/unpublish?siteId=${SITE_ID}`, {
      headers: ADMIN_HEADERS,
    })
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(body.status).toBe('Draft')
  })

  test('DELETE /admin/blog/:id — delete post with siteId', async ({ request }) => {
    test.skip(!createdPostId, 'No post created')
    const resp = await request.delete(`${API_URL}/admin/blog/${createdPostId}?siteId=${SITE_ID}`, {
      headers: ADMIN_HEADERS,
    })
    expect(resp.status()).toBe(204)
  })

  test('GET /admin/blog — without siteId returns 400', async ({ request }) => {
    const resp = await request.get(`${API_URL}/admin/blog`, {
      headers: ADMIN_HEADERS,
    })
    // Required param missing → 400
    expect(resp.status()).toBe(400)
  })

  test('admin blog page loads', async ({ page }) => {
    await page.goto('/blog')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toContainText('INTERNAL_ERROR')
  })
})
