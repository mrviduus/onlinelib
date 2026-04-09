import { test as base, type Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

type AuthFixtures = {
  authedPage: Page
}

export const test = base.extend<AuthFixtures>({
  authedPage: async ({ browser, baseURL }, use) => {
    const authFile = path.resolve(__dirname, '../.auth/user.json')
    const context = await browser.newContext({
      storageState: authFile,
      baseURL: baseURL ?? undefined,
    })
    const page = await context.newPage()
    // Pre-set native language so the language picker modal doesn't block tests
    await page.addInitScript(() => {
      localStorage.setItem('textstack_native_language', 'en')
      localStorage.setItem('reader.onboarding.seen', '1')
    })
    await use(page)
    await context.close()
  },
})

export { expect } from '@playwright/test'
