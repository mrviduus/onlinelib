# ADR-014 — Anonymous guest sessions

**Status:** Accepted · **Date:** 2026-09-06 · **Shipped** on web from PR #453 (reader, upload,
pending-vocabulary triggers), on mobile in the guest-session PR that this record accompanies.

Related: [ADR-002](002-google-auth-only.md) is **stale** — it records Google-only auth, and
email/password and Apple sign-in both shipped afterwards. It is left as written; this ADR does not
supersede it, it only records the tier *below* it.

This documents a posture the code already enforces in three places (the server's entitlement tiers,
the mobile capability module, the endpoint filter) and which had never been written down anywhere a
reviewer would find it. The consequence of that was a client-side gate believed to be a boundary —
see "AI is a cost decision" below.

## Context

TextStack's thesis is that fluency comes from long-form reading, and the loop that delivers it is
*read → tap a word → save it → review it*. Every step past the first writes to `/me/*`. So a person
who has not signed up can read, and nothing they do while reading survives — the product's core loop
is gated behind an account they have no reason to want yet.

Two facts shape the answer.

**The reader is not a logged-out visitor; it is an account nobody has claimed.** Progress,
highlights, bookmarks and vocabulary are all user-keyed rows. Anything that keeps them has to key
them to *something*, and the only durable something is a `User` row.

**Mobile's session predicate is a single boolean.** `AuthContext` exposes `isAuthenticated`, defined
as `user !== null`, and roughly seventy call sites read it. Whatever an anonymous session is, it
flips all seventy at once.

## Decision

### 1. An anonymous reader is a real `User` row, minted on demand

`POST /auth/guest` creates a `User` with `IsGuest = true`, a synthesized
`guest-<hex>@guest.local` email, no password, and a normal access/refresh pair — a 60-minute access
token and a refresh token on the shorter guest TTL (`Jwt:GuestRefreshTokenExpiryDays`, 30 days;
accounts get `RefreshTokenExpiryDays`). Everything downstream of it — `/me/progress`,
`/me/highlights`, `/me/vocabulary/*` — works unchanged, because from the API's point of view nothing
about the request is unusual.

**On demand, never at launch.** Web mints from three triggers (reader mount, upload, the third
pending vocabulary word). Mobile mints from exactly one: opening a book, through
`ReaderSessionGate`. Minting at launch would create a row for every install that browses the catalog
and leaves.

### 2. Registration promotes that row in place; sign-in merges it

`AuthService.RegisterWithEmailAsync` takes the guest id and rewrites the *same* row — email, name,
password hash, `IsGuest = false`. No rows move, so nothing can be lost in the moving.

Signing in to an **existing** account is the harder case and goes through `MergeGuestAsync`, which
re-parents every user-keyed entity from the guest to the account in one transaction. Conflict rule:
the account's row wins on every unique-keyed table except `ReadingProgress`, where the newer of the
two wins (last-write-wins on `UpdatedAt`).

### 3. What a guest may not do, and why each one

The policy lives in config (`Entitlements:Tiers:Guest`) and is mirrored — not re-decided — by the
client in `apps/mobile/src/lib/capabilities.ts`.

| Capability | Guest | Reason |
|---|---|---|
| Read, translate, look a word up | **yes** | `POST /translate` and `GET /dictionary/{lang}/{word}` are anonymous endpoints. Gating them gates reading itself. |
| Save vocabulary, highlight, bookmark, keep progress | **yes** | This is the loop. It is the whole point of the row existing. |
| Upload a book | no | **A product choice, not a server constraint.** `Entitlements:Tiers:Guest` allows one book at 50 MB, and the server would accept it. A guest who uploads their only book and then loses the phone has lost the book, and we took the storage to arrange that. Upload is the moment to ask for an account. |
| Librarian, tutor, "Ask this book", book chat, RAG indexing | no | **A cost decision.** These spend paid inference. Guest sessions are free and unlimited to mint, and every limiter fronting those routes partitions on IP alone. |
| Edit name or avatar | no | The identity is generated and visible to nobody. A setting with no consequence. |
| Delete the account | no | Nothing to delete that signing out has not already put out of reach. |
| Sign out without confirmation | no | See §5. |

Vocabulary saving is allowed but **metered**: `Entitlements:Tiers:Guest:DailyEnrichmentCap` (50/day)
clamps the user's own daily cap, because each new word queues LLM enrichment (distractors, hint,
explanation). The cap and the on/off switch are separate knobs on purpose — the cap meters a feature
the tier *has*, `AiEnabled` decides whether it has it.

Both default permissively when unset: an absent or `<= 0` value means *unlimited* / *allowed*. The
failure mode of a config typo is then a bill, not a silent outage for paying users.

### 4. The client flag is an affordance; the server is the boundary

`capabilitiesFor(user).canUseAi` decides what the app *shows*. It decides nothing about what the API
*accepts* — a guest token is a valid bearer token, and before this every paid-inference route
answered a guest with a real model call. `RequireAiAccount()` (`Api/Extensions/AiAccountPolicy.cs`)
is an endpoint filter that resolves the caller's tier and refuses before the handler runs.

It returns **403** with `error: "account_required"`, deliberately distinct from 401. The two mean
different things to a client and produce different copy: 401 is *sign in*, 403 here is *sign **up***.

### 5. Sign-out is a different operation for a guest

For an account, sign-out clears three SecureStore keys and an email and password get all of it back
on any device. For a guest those three keys are the **only** handle that exists: there is no email to
sign in with and no password. The row itself survives — `GuestCleanupWorker` refuses to prune a guest
holding vocabulary, highlights, bookmarks, library rows, uploads, notes or progress — so the books
stay on the server forever and nothing can ever reach them again, including us.

That is a delete. It gets a destructive confirm that names what disappears.

### 6. `isAuthenticated` stays the session predicate; a capability set owns account policy

The seventy call sites do not all ask the same question.

- **~16 mean "do I have a token, so can I call `/me/*`?"** — `useReadingSession`,
  `useReaderHighlights`, `useReaderBookmarks`, `useReaderVocabMap`, `useQuickStats`, the library
  tab. All of these are *already correct* for a guest and are deliberately not migrated. Changing
  them would break syncing for exactly the readers this work exists to serve.
- **~8 mean "is there a durable, recoverable account behind this?"** — only these consult
  `capabilitiesFor(user)`.

So `isAuthenticated` keeps its meaning, and a pure total function
(`apps/mobile/src/lib/capabilities.ts`) answers the second question by name.

The one place where the obvious migration is wrong is the root redirect: `/` keys on `isAccount`, not
`hasSession`, so a guest still lands on Discover rather than an empty Library.

## Alternatives rejected

**A bare `isGuest` boolean on the auth context.** It forces every screen to re-derive
`isAuthenticated && !user?.isGuest` inline, and the re-derivation is where it goes wrong. Live
example, on one screen: `profile.tsx` hid the edit pencil behind `!isGuest` while the
`TouchableOpacity` wrapping it still called `startEdit`, and `pickAvatar` beside it had no guard at
all — so a guest could `PUT /me/profile` on a throwaway row. The policy was written twice in one file
and only one copy was right. A capability name (`canEditIdentity`) says what the caller may *do*, so
a reviewer can see it is on the wrong control; `!isGuest` says only what the viewer *is* and reads
plausible next to anything. `capabilityLiterals.test.ts` fails the build on the re-derivation, with a
short allow-list where each entry carries its reason.

**A client-only gate.** What we had. A guest token is a valid bearer token, so it was never a
boundary — the whole paid-inference surface was account-only in the UI and open on the wire.

**Device-local state with no server row.** Keeping a guest's words in AsyncStorage/IndexedDB avoids
the row, and then every one of them has to be replayed at sign-up through a queue that has its own
failure modes, its own conflict rules and no server-side test. It also cannot sync, cannot survive a
reinstall, and produces a second, divergent implementation of every write path. The row is cheaper
and it is the same code.

**Minting at app launch.** Rejected on cost (§1) and because it makes the first launch of a browsing
visitor indistinguishable from a reader's.

## Consequences

- **One `User` row per install that opens a book.** Pruned only when it holds nothing durable:
  `GuestCleanupWorker` runs every 2h and deletes guests inactive 30 days, excluding any that hold
  vocabulary, highlights, bookmarks, library rows, uploads, notes or progress. An engaged guest lives
  indefinitely, which is intended and is what makes §5 true.
- **`ReadingSessions` are excluded from that preservation filter by design**, and reading alone does
  not refresh `LastActiveAt` (see Open). So a guest who reads daily and saves nothing is still
  reaped at 30 days.
- **The merge is a growing surface.** Every new user-keyed table must be added to `MergeGuestAsync`,
  and getting it wrong is not a compile error. `UserChapterChunk` is the cautionary case: its
  `UserId` is denormalized off `UserBook` with no FK, so missing it leaves rows that outlive the
  guest and a silently dead "Ask this book" on a visible library book.
- **The merge never throws on a constraint violation.** It catches SQLSTATE class 23 only, logs at
  Error, and returns `false`; everything else (timeouts, cancellation) still propagates, because
  those are the cases where retrying works. The trade is explicit: a swallowed conflict orphans the
  guest's data, but letting it escape turns one bad row into a permanent sign-in outage — the client
  re-presents the same guest token on every attempt, and the only mobile "fix" is wiping app data,
  which destroys the guest session too.
- **Sign-in can now report a partial outcome.** `guestMergeSkipped` (`invalid_token` |
  `merge_conflict`) is additive and optional on both auth responses. No client reads it yet; the
  server-side Warning per occurrence is what makes the rate countable.
- **A guest's `NativeLanguage` is carried across on merge**, and never clobbers an account's own.

## Open

- **`GuestActivityMiddleware` is dead code.** It reads `context.User.FindFirst("is_guest")`, but the
  API registers no ASP.NET authentication middleware at all — auth is manual per endpoint via
  `GetUserId`. `context.User` never carries the claim, so `LastActiveAt` is only ever written at
  guest creation. This was harmless while mobile minted no guests. It no longer is.
- **No client surfaces `guestMergeSkipped`.** The server stopped being silent; the app has not yet
  started speaking.
- **The account-required 403 has no dedicated client copy on every surface.** The affordances are
  hidden, so it is reachable mainly by a stale client or a direct call.

## Enforced by

- `backend/src/Api/Extensions/AiAccountPolicy.cs` — the 403, and `GuestAiAccessTests`
- `backend/src/Application/Entitlements/EntitlementOptions.cs` — `AiEnabledFor`,
  `DailyEnrichmentCapFor`, and their permissive defaults
- `backend/src/Application/Auth/AuthService.cs` — in-place promotion and `MergeGuestAsync`
- `apps/mobile/src/lib/capabilities.ts` + `capabilities.test.ts` — the policy, once
- `apps/mobile/src/lib/capabilityLiterals.test.ts` — the ban on re-deriving it
- `apps/mobile/src/lib/profileActions.ts` — the sign-out branch
- `tests/TextStack.IntegrationTests/GuestSessionEndpointTests.cs`, `GuestMergeDurabilityTests.cs`,
  `GuestMergeConflictTests.cs`, `GuestMergeSkipReportingTests.cs`,
  `GuestEnrichmentCapEnforcementTests.cs`
- `docs/qa/scenarios/QA-005-guest-loop.md` — the wiring no runner reaches
