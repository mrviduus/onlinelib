import { test, expect } from '../fixtures/auth.fixture'
import type { Page } from '@playwright/test'

// E2E coverage for the destructive account-deletion flow:
//   User menu → Edit profile (ProfileModal) → Danger zone → Delete account
//   → DeleteAccountDialog (type DELETE to arm) → DELETE /api/me/account
//   → session cleared → redirect to localized home /:lang/.
//
// SAFETY: we NEVER let a real DELETE reach the backend. The shared e2e test user
// is created once in global-setup and reused by every other spec — actually
// deleting it would break the whole suite. So the destructive happy-path and the
// error-path both stub `**/me/account` via page.route(); the gating + public-page
// tests touch no network at all.

const CONFIRM_PHRASE = 'DELETE'

// Opens the user menu and clicks "Edit profile" to mount the ProfileModal.
async function openProfileModal(page: Page) {
  await page.goto('/en/')
  await page.waitForLoadState('networkidle')

  // The signed-in header renders the UserMenu trigger; click to open the dropdown.
  const trigger = page.locator('.user-menu__trigger')
  await expect(trigger).toBeVisible({ timeout: 15_000 })
  await trigger.click()

  await page.getByRole('button', { name: 'Edit profile' }).click()
  await expect(page.locator('.profile-modal').first()).toBeVisible()
}

// Opens the destructive DeleteAccountDialog from within the ProfileModal.
async function openDeleteDialog(page: Page) {
  await openProfileModal(page)

  // Danger zone only renders for non-guest users (the test-login user is non-guest).
  const dangerTitle = page.locator('.profile-modal__danger-title')
  await expect(dangerTitle).toBeVisible()
  await expect(dangerTitle).toHaveText('Danger zone')

  await page.locator('.profile-modal__danger-zone .profile-modal__btn--danger').click()

  // The dialog (role="dialog", aria-labelledby) mounts on top.
  const dialog = page.getByRole('dialog', { name: /delete your account\?/i })
  await expect(dialog).toBeVisible()
  return dialog
}

test.describe('Account deletion flow', () => {
  test('danger zone + Delete account button visible for authed user', async ({ authedPage: page }) => {
    await openProfileModal(page)

    const dangerZone = page.locator('.profile-modal__danger-zone')
    await expect(dangerZone).toBeVisible()
    await expect(dangerZone.locator('.profile-modal__danger-title')).toHaveText('Danger zone')
    await expect(
      dangerZone.getByRole('button', { name: 'Delete account' }),
    ).toBeVisible()
  })

  test('confirm button disabled until exact DELETE phrase typed', async ({ authedPage: page }) => {
    const dialog = await openDeleteDialog(page)

    const confirmBtn = dialog.locator('.profile-modal__btn--danger')
    const input = dialog.locator('#delete-account-confirm')

    // Disabled on open (empty input).
    await expect(confirmBtn).toBeDisabled()

    // Wrong / partial phrase keeps it disabled.
    await input.fill('delete')
    await expect(confirmBtn).toBeDisabled()
    await input.fill('DELETE ME')
    await expect(confirmBtn).toBeDisabled()

    // Exact phrase arms it. (Trailing whitespace is trimmed → still armed.)
    await input.fill(CONFIRM_PHRASE)
    await expect(confirmBtn).toBeEnabled()
    await input.fill(`  ${CONFIRM_PHRASE}  `)
    await expect(confirmBtn).toBeEnabled()

    // Clearing disarms again.
    await input.fill('')
    await expect(confirmBtn).toBeDisabled()
  })

  test('confirm with stubbed 204 → signs out and redirects home', async ({ authedPage: page }) => {
    let deleteCalled = false
    // Stub the destructive call so NO real deletion happens; assert it was hit.
    await page.route('**/me/account', async route => {
      if (route.request().method() === 'DELETE') {
        deleteCalled = true
        await route.fulfill({ status: 204, body: '' })
      } else {
        await route.continue()
      }
    })

    const dialog = await openDeleteDialog(page)
    await dialog.locator('#delete-account-confirm').fill(CONFIRM_PHRASE)
    await dialog.locator('.profile-modal__btn--danger').click()

    // Redirect to localized home.
    await page.waitForURL(/\/en\/?($|\?)/, { timeout: 15_000 })
    expect(deleteCalled).toBe(true)

    // Signed-out header: UserMenu trigger gone, Sign in icon button present.
    // (exact match — "Sign in to upload" also exists in the signed-out header.)
    await expect(page.locator('.user-menu__trigger')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  })

  test('confirm with stubbed 500 → stays signed in, error shown', async ({ authedPage: page }) => {
    await page.route('**/me/account', async route => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'boom' }),
        })
      } else {
        await route.continue()
      }
    })

    const dialog = await openDeleteDialog(page)
    await dialog.locator('#delete-account-confirm').fill(CONFIRM_PHRASE)
    await dialog.locator('.profile-modal__btn--danger').click()

    // Error surfaced inside the dialog; dialog stays open.
    await expect(dialog.locator('.profile-modal__error')).toBeVisible({ timeout: 15_000 })
    await expect(dialog).toBeVisible()

    // Still on a non-home route is not guaranteed, but the user must remain
    // signed in — the UserMenu trigger is still mountable. Reload to confirm
    // the session survived (no navigation occurred, user not nulled).
    await expect(page.locator('.user-menu__trigger')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0)
  })
})

test.describe('Public delete-account info page', () => {
  // No auth needed — this is the public GDPR/Play-Store info page.
  test('renders irreversibility + what-gets-deleted copy', async ({ page }) => {
    await page.goto('/en/delete-account')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByRole('heading', { name: 'Delete your account', level: 1 }),
    ).toBeVisible()

    // Key sections from en.json deleteAccount.*
    await expect(page.getByRole('heading', { name: 'Delete in the app' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What gets deleted' })).toBeVisible()

    // Irreversibility copy must be present.
    await expect(page.getByText('This action cannot be undone.')).toBeVisible()
    // Enumerates deleted data so users know the blast radius.
    await expect(
      page.getByText(/highlights and notes, saved vocabulary, reading progress/i),
    ).toBeVisible()
  })
})
