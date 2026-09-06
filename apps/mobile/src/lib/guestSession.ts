import type { UserDto } from '@textstack/shared'

/**
 * The two decisions guest minting is made of, pulled out of `AuthContext` so
 * they can be tested: **may we mint** and **may the answer be applied**.
 *
 * Ported from the web implementation (`apps/web/src/context/AuthContext.tsx`)
 * with three corrections, each of which is a live bug there:
 *
 * 1. **A failed mint is silent on web.** `createGuestOnce` catches, sets the
 *    user to `null` and returns — a reader who is offline or rate limited
 *    stays anonymous with no signal, while their vocabulary saves queue up
 *    locally forever. Here every path produces an `EnsureSessionResult`, so a
 *    caller can tell "you already had a session" from "minting failed".
 * 2. **Web's trigger is gated on `isAuthenticated`, which is `false` during
 *    bootstrap.** A returning user deep-linking into the reader therefore
 *    races a mint against their own session restore — burning one of the
 *    permitted mints per window and orphaning a server row. Mobile has the
 *    same window: `AuthContext` holds `isLoading` until the SecureStore read
 *    answers. `decideMint` refuses while `isLoading` is true, full stop.
 * 3. **The mobile-only hazard.** `signInWithTokens` performs THREE sequential
 *    SecureStore writes. A guest response resolving between them leaves a
 *    mixed pair — a guest access token next to an account refresh token, or
 *    vice versa. Web's `setUser(prev => …)` guard cannot see this, because the
 *    corruption is in storage, not in React state. `decideApplyGuest` is
 *    therefore consulted before EVERY write, not once before `setUser`, and
 *    keys on a monotonic epoch that `signInWithTokens`/`signOut` bump.
 */

/**
 * How long `waitForSession()` will wait for the bootstrap SecureStore read
 * before giving up and answering anyway.
 *
 * Web uses 15s. That is wrong for mobile: bootstrap here is a local keychain
 * read, not a network round-trip, so anything past a couple of hundred
 * milliseconds means the native module is wedged and waiting longer buys
 * nothing. 2s is far beyond p99 and short enough that the reader gate's own
 * budget still has room for the mint itself.
 */
export const SESSION_BOOTSTRAP_TIMEOUT_MS = 2_000

// ---------------------------------------------------------------------------
// Decision 1 — may we mint?
// ---------------------------------------------------------------------------

export type MintDecision =
  | { action: 'mint' }
  | { action: 'skip'; reason: 'bootstrapping' | 'session-exists' }

/**
 * Pure: given what `AuthContext` currently knows, should a guest be minted?
 *
 * Order matters. `isLoading` is checked FIRST because during bootstrap `user`
 * is legitimately `null` for a user who does have a stored session — treating
 * that `null` as "no session" is exactly bug (2) above.
 */
export function decideMint(input: { isLoading: boolean; user: UserDto | null }): MintDecision {
  if (input.isLoading) return { action: 'skip', reason: 'bootstrapping' }
  if (input.user !== null) return { action: 'skip', reason: 'session-exists' }
  return { action: 'mint' }
}

// ---------------------------------------------------------------------------
// Decision 2 — may the minted session be applied?
// ---------------------------------------------------------------------------

export type GuestDiscardReason = 'epoch-moved' | 'account-arrived'

export type ApplyDecision = { action: 'apply' } | { action: 'discard'; reason: GuestDiscardReason }

/**
 * Pure: a guest response has come back (or we are part-way through writing
 * it). Is it still the truth?
 *
 * @param epochAtStart the auth epoch captured before the first `await`
 * @param epochNow     the auth epoch right now
 * @param currentUser  the user in React state right now
 */
export function decideApplyGuest(input: {
  epochAtStart: number
  epochNow: number
  currentUser: UserDto | null
}): ApplyDecision {
  // Checked first, and it is the check that actually protects storage. Any
  // sign-in or sign-out that started after we did has already bumped the
  // epoch, synchronously, before its own first write. So a guest write that
  // consults this immediately before calling SecureStore cannot land in the
  // middle of somebody else's three writes.
  if (input.epochNow !== input.epochAtStart) return { action: 'discard', reason: 'epoch-moved' }
  // The no-downgrade invariant. Belt to the epoch's braces: a real account in
  // state is never replaced by an anonymous row, whatever the epoch says.
  if (input.currentUser !== null && !input.currentUser.isGuest) {
    return { action: 'discard', reason: 'account-arrived' }
  }
  // `currentUser` being an older guest is NOT a reason to discard. Minting is
  // single-flighted, so a second guest response can only exist if the first
  // one is already stale; the freshly-minted tokens are the ones now in
  // SecureStore, and state must agree with storage.
  return { action: 'apply' }
}

// ---------------------------------------------------------------------------
// The answer `ensureSession()` gives back
// ---------------------------------------------------------------------------

/**
 * Never thrown, always returned — `ensureSession()` is called from
 * fire-and-forget paths (a route gate, a word tap) where a throw would become
 * an unhandled rejection. Callers that care branch on `status`.
 */
export type EnsureSessionResult =
  /** A session was already there. `isGuest` says which kind. Nothing was minted. */
  | { status: 'existing'; isGuest: boolean }
  /** A guest session was minted and is now live. */
  | { status: 'minted' }
  /** Mint succeeded but was thrown away — a better session won the race. */
  | { status: 'discarded'; reason: GuestDiscardReason }
  /** Bootstrap never settled in time; we refused to mint over a possible session. */
  | { status: 'skipped'; reason: 'bootstrapping' }
  /** The mint itself failed: offline, rate limited, or a token-less response. */
  | { status: 'failed'; error: unknown }
