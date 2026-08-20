import type { APIRequestContext } from '@playwright/test'

const API_URL = process.env.API_URL ?? 'http://localhost:8080'

export async function testLogin(request: APIRequestContext, email = 'e2e-test@textstack.app') {
  const resp = await request.post(`${API_URL}/auth/test-login`, {
    data: { email },
    headers: { Host: 'general.localhost' },
  })
  if (!resp.ok()) throw new Error(`test-login failed: ${resp.status()} ${await resp.text()}`)
  return resp
}

export async function adminLogin(request: APIRequestContext) {
  const resp = await request.post(`${API_URL}/admin/auth/login`, {
    data: {
      email: process.env.ADMIN_EMAIL ?? 'admin@textstack.app',
      password: process.env.ADMIN_PASSWORD ?? 'admin',
    },
    headers: { Host: 'general.localhost' },
  })
  if (!resp.ok()) throw new Error(`admin login failed: ${resp.status()} ${await resp.text()}`)
  return resp
}

