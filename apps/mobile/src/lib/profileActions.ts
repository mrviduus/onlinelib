import type { UserDto } from '@textstack/shared'
import { capabilitiesFor } from './capabilities'

/**
 * What tapping "Sign out" has to do before it does anything.
 *
 * - `immediate` — clear the tokens and go. Nothing is lost that cannot be got
 *   back by signing in again.
 * - `confirm-destructive` — ask first, in a destructive alert that names what
 *   disappears, because signing out here is not reversible by anyone.
 */
export type SignOutIntent = 'immediate' | 'confirm-destructive'

/**
 * Sign-out is two different operations wearing one label.
 *
 * For an account it is what it looks like: `signOut()` deletes `access_token`,
 * `refresh_token` and `user` from SecureStore, and the email + password get all
 * of it back on any device.
 *
 * For a guest those same three keys are the ONLY handle that exists on the
 * account. There is no email to sign in with — the server generated
 * `guest-<hex>@guest.local` and no one knows the password because there isn't
 * one. The row itself survives: `GuestCleanupWorker` explicitly refuses to prune
 * a guest holding vocabulary, highlights, bookmarks, library rows, uploads,
 * notes or progress. So the books stay on the server, forever, and nothing can
 * ever reach them again — not the reader, not support, not us.
 *
 * That is a delete. It shipped as an unconfirmed row in the settings list, one
 * tap from the Profile tab, with no dialog and no error, sitting where every
 * other app puts a harmless action. This function is the whole decision, pulled
 * out of the screen so it can be asserted instead of eyeballed.
 *
 * Pure, and delegating to `capabilitiesFor` rather than re-deriving `isGuest` —
 * a second copy of the policy is how the pencil-icon bug on this same screen
 * happened.
 */
export function signOutIntent(user: UserDto | null): SignOutIntent {
  return capabilitiesFor(user).canSignOutSilently ? 'immediate' : 'confirm-destructive'
}
