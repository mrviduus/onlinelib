/**
 * "Is this access token still good?" — read client-side, without validating it.
 *
 * **Why this exists.** Access tokens live 60 minutes
 * (`JwtSettings.AccessTokenExpiryMinutes`); a guest's refresh token lives 30
 * days. Nothing on mobile refreshes proactively: `onUnauthorized` only fires
 * when some *other* call gets a 401, and the once-per-session profile refetch
 * is skipped for guests. So a guest who reads on Monday and taps "Create free
 * account" on Tuesday sends an access token that expired overnight.
 *
 * On the four merge entry points (`/auth/register`, `/auth/login`,
 * `/auth/google`, `/auth/apple`) that is not a 401 — it is a **silent 200**.
 * The server's `GetGuestUserId` validates the bearer with `ClockSkew = Zero`,
 * gets `null`, and simply never runs `MergeGuestAsync`; registration succeeds
 * and the guest's vocabulary, highlights, bookmarks, notes, sessions, progress
 * and library are orphaned with no error anywhere. An expired bearer is
 * therefore strictly *worse* than none: none cannot masquerade as a live guest.
 *
 * **Why reading `exp` unvalidated is safe here.** It is our own token, we are
 * not making a trust decision from it, and the only consequence of misreading
 * it is one unnecessary `POST /auth/refresh-mobile`.
 *
 * **The conservative direction.** A token we cannot parse is reported as NOT
 * expiring. A pessimistic reading would be tempting ("refresh anything odd"),
 * but a refresh that fails offline returns `null`, and we would then drop a
 * bearer that was in fact perfectly valid — losing the very merge this module
 * exists to protect. Unparseable therefore keeps today's behaviour exactly.
 */

/**
 * Treat a token as spent this long *before* its `exp`.
 *
 * Covers the flight time of the request it is about to be attached to and small
 * device-clock drift. A device whose clock is slow by more than this still
 * sends an expired token — that one is only fixable server-side, by having the
 * merge endpoints report an unusable bearer instead of silently ignoring it.
 */
export const TOKEN_EXPIRY_SKEW_MS = 60_000

function decodeBase64Url(segment: string): string | null {
  const b64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const g = globalThis as { atob?: (s: string) => string; Buffer?: { from: (s: string, enc: string) => { toString: (enc: string) => string } } }
  try {
    if (typeof g.atob === 'function') return g.atob(padded)
    if (g.Buffer) return g.Buffer.from(padded, 'base64').toString('binary')
  } catch {
    return null
  }
  return null
}

/**
 * The token's `exp` claim in epoch **milliseconds**, or `null` when the token
 * is not a JWT, is unreadable, or carries no numeric `exp`.
 */
export function readTokenExpiryMs(token: string | null | undefined): number | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const json = decodeBase64Url(parts[1])
  if (!json) return null
  let exp: unknown
  try {
    exp = (JSON.parse(json) as { exp?: unknown }).exp
  } catch {
    // `atob` hands back latin1, so a payload with non-ASCII claims (a name, an
    // email) can arrive as mojibake that `JSON.parse` rejects. `exp` is ASCII
    // digits either way, so pull it out directly rather than giving up.
    const m = /"exp"\s*:\s*(\d+)/.exec(json)
    exp = m ? Number(m[1]) : undefined
  }
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return null
  return exp * 1000
}

/**
 * True when the token is expired, or will be within `skewMs`.
 *
 * False for a token whose expiry cannot be read — see the module docblock: the
 * conservative answer preserves today's behaviour instead of risking the loss
 * of a valid bearer.
 */
export function isTokenExpiring(
  token: string | null | undefined,
  nowMs: number = Date.now(),
  skewMs: number = TOKEN_EXPIRY_SKEW_MS,
): boolean {
  const expiryMs = readTokenExpiryMs(token)
  if (expiryMs === null) return false
  return expiryMs - nowMs <= skewMs
}
