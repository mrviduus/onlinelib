import { test, expect } from '../fixtures/auth.fixture'
import { test as baseTest, expect as baseExpect } from '@playwright/test'

test.describe('Header upload button (authenticated)', () => {
  test('button visible on home, opens upload modal directly, Esc closes', async ({ authedPage: page }) => {
    await page.goto('/en')
    const trigger = page.locator('header').getByRole('button', { name: /upload book/i })
    await expect(trigger).toBeVisible()
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: /upload a book/i })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  test('Cmd+U opens modal globally', async ({ authedPage: page }) => {
    await page.goto('/en/books')
    await page.keyboard.press('Meta+u')
    await expect(page.getByRole('dialog', { name: /upload a book/i })).toBeVisible()
  })

  test('button visible on /en/library', async ({ authedPage: page }) => {
    await page.goto('/en/library')
    await expect(page.locator('header').getByRole('button', { name: /upload book/i })).toBeVisible()
  })
})

baseTest.describe('Header upload button (unauthenticated)', () => {
  baseTest('shows sign-in CTA, hides upload button', async ({ page }) => {
    await page.goto('/en')
    const sign = page.getByRole('button', { name: /sign in to upload/i })
    await baseExpect(sign).toBeVisible()
    await baseExpect(page.getByRole('button', { name: /^upload book$/i })).toHaveCount(0)
  })
})
