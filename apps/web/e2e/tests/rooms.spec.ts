import { test, expect } from '../fixtures/auth.fixture'
import { testLogin } from '../helpers/api'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API_URL = process.env.API_URL ?? 'http://localhost:8080'
const HEADERS = { Host: 'general.localhost', 'Content-Type': 'application/json' }

function loadTestData() {
  const p = path.resolve(__dirname, '..', '.test-data.json')
  if (!fs.existsSync(p)) return null
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) } catch { return null }
}

test.describe('Reading rooms', () => {
  let enBook: { editionId: string; slug: string; firstChapterSlug: string } | null = null

  test.beforeAll(async () => {
    const data = loadTestData()
    if (!data?.enBook?.editionId) test.skip(true, 'No English test book available')
    enBook = data.enBook
  })

  test('owner creates room, reader shows top bar + menu + invite modal auto-opens', async ({ authedPage: page, request }) => {
    await testLogin(request)
    const resp = await request.post(`${API_URL}/me/rooms`, {
      headers: HEADERS,
      data: { targetType: 'Edition', targetId: enBook!.editionId },
    })
    if (!resp.ok()) {
      console.error(`POST /me/rooms failed: ${resp.status()} ${await resp.text()}`)
    }
    expect(resp.ok()).toBeTruthy()
    const body = await resp.json()
    const roomId = body.roomId
    expect(roomId).toBeTruthy()

    await page.goto(`/en/books/${enBook!.slug}/${enBook!.firstChapterSlug}?room=${roomId}&openInvite=1`)

    const topbar = page.locator('.room-topbar')
    await expect(topbar).toBeVisible({ timeout: 10000 })

    // Invite modal should auto-open because of &openInvite=1
    await expect(page.locator('.room-modal')).toBeVisible()
    await expect(page.locator('.room-modal__primary')).toBeEnabled()

    // Close invite, verify URL no longer carries openInvite
    await page.locator('.room-modal__close').click()
    await expect(page.locator('.room-modal')).toBeHidden()
    expect(page.url()).not.toContain('openInvite=1')
    expect(page.url()).toContain(`room=${roomId}`)

    // Reopen via menu → Invite
    await page.locator('.room-topbar__menu-btn').click()
    await page.getByRole('menu').getByRole('button', { name: /invite/i }).click()
    await expect(page.locator('.room-modal')).toBeVisible()

    // Generate link
    await page.locator('.room-modal__primary').click()
    await expect(page.locator('.room-modal__link')).toBeVisible()
    const link = await page.locator('.room-modal__link').inputValue()
    expect(link).toMatch(/\/rooms\/join\/[A-Za-z0-9_-]+$/)

    // Clean up: close the room
    await request.delete(`${API_URL}/me/rooms/${roomId}`, { headers: HEADERS })
  })

  test('join-page without auth shows sign-in prompt', async ({ browser, request }) => {
    // Make sure we have a valid invite token to visit
    await testLogin(request)
    const roomResp = await request.post(`${API_URL}/me/rooms`, {
      headers: HEADERS,
      data: { targetType: 'Edition', targetId: enBook!.editionId },
    })
    if (!roomResp.ok()) {
      console.error(`POST /me/rooms failed: ${roomResp.status()} ${await roomResp.text()}`)
    }
    const { roomId, inviteToken } = await roomResp.json()
    expect(inviteToken).toBeTruthy()

    const ctx = await browser.newContext() // no auth cookies
    const page = await ctx.newPage()
    await page.goto(`/en/rooms/join/${inviteToken}`)
    await expect(page.getByText(/sign in|увійдіть/i)).toBeVisible({ timeout: 5000 })
    await ctx.close()

    await request.delete(`${API_URL}/me/rooms/${roomId}`, { headers: HEADERS })
  })

  test('second user joins via token then sees topbar in reader', async ({ browser, request }) => {
    // Owner creates room
    await testLogin(request, 'e2e-test@textstack.app')
    const roomResp = await request.post(`${API_URL}/me/rooms`, {
      headers: HEADERS,
      data: { targetType: 'Edition', targetId: enBook!.editionId },
    })
    if (!roomResp.ok()) {
      console.error(`POST /me/rooms failed: ${roomResp.status()} ${await roomResp.text()}`)
    }
    const { roomId, inviteToken } = await roomResp.json()

    // Second user context
    const ctx = await browser.newContext()
    await testLogin(ctx.request, 'e2e-test-2@textstack.app')
    const joinResp = await ctx.request.post(`${API_URL}/rooms/join`, {
      headers: HEADERS,
      data: { token: inviteToken },
    })
    if (!joinResp.ok()) {
      console.error(`POST /rooms/join failed: ${joinResp.status()} ${await joinResp.text()}`)
    }
    expect(joinResp.ok()).toBeTruthy()
    const page = await ctx.newPage()
    await page.goto(`/en/books/${enBook!.slug}/${enBook!.firstChapterSlug}?room=${roomId}`)
    await expect(page.locator('.room-topbar')).toBeVisible({ timeout: 10000 })
    // Member list should have >= 2 entries
    const avatars = page.locator('.room-topbar__members li').filter({ hasNotText: /^\+/ })
    await expect.poll(async () => avatars.count()).toBeGreaterThanOrEqual(2)
    await ctx.close()

    // Owner closes the room
    await testLogin(request, 'e2e-test@textstack.app')
    await request.delete(`${API_URL}/me/rooms/${roomId}`, { headers: HEADERS })
  })
})
