import { describe, it, expect } from 'vitest'
import type { UserDto } from '@textstack/shared'
import { signOutIntent } from './profileActions'

const guest: UserDto = {
  id: 'g-1',
  email: 'guest-0f3a9c1e@guest.local',
  name: null,
  picture: null,
  createdAt: '2026-09-01T00:00:00Z',
  isGuest: true,
  nativeLanguage: null,
}

const account: UserDto = { ...guest, id: 'u-1', email: 'reader@example.com', name: 'Reader', isGuest: false }

describe('signOutIntent', () => {
  it('signed out: immediate — there is no session to lose', () => {
    expect(signOutIntent(null)).toBe('immediate')
  })

  it('account: immediate — an email and a password get all of it back', () => {
    expect(signOutIntent(account)).toBe('immediate')
  })

  /**
   * The one that matters, and the reason this file exists.
   *
   * A guest's SecureStore tokens are the only handle on their account: the email is
   * server-generated (`guest-<hex>@guest.local`) and there is no password, so the
   * sign-in screen cannot get back in. The server-side row is NOT deleted —
   * `GuestCleanupWorker` deliberately preserves any guest holding vocabulary,
   * highlights, bookmarks, library rows, uploads, notes or progress — which makes
   * this worse rather than better: the books exist, indefinitely, and are unreachable
   * by the reader, by support, and by us.
   *
   * Before this, that was an unconfirmed row in the settings list. One tap, no dialog,
   * no error, everything gone. If this assertion ever flips to 'immediate', the tap is
   * live again.
   */
  it('guest: confirm-destructive — the tokens on this device are the only key that exists', () => {
    expect(signOutIntent(guest)).toBe('confirm-destructive')
  })

  it('is decided by the guest flag alone, not by how furnished the profile looks', () => {
    // A guest who has read for a month has a name and an avatar. Nothing about a
    // populated-looking profile makes the session recoverable.
    const settledGuest: UserDto = { ...guest, name: 'Quiet Heron', picture: '/storage/avatars/g-1.jpg' }
    expect(signOutIntent(settledGuest)).toBe('confirm-destructive')
  })
})
