# Slice 03 — `/home` route + state-aware landing

**Phase:** 1 (IA foundation) · **Estimated:** 1.5 days · **Risk:** medium (bot detection) · **Flag:** `myBooksV3.stateAwareLanding`

## Goal

Authenticated users land in **their workspace** (`/home`), not on the SEO marketing page. Unauthenticated visitors continue to land on `/` (current marketing hero) for SEO funnel.

This slice creates the `/home` route as a placeholder shell — slice 04 fills it with smart shelves.

## Acceptance criteria

1. New route `/en/home` (and `/uk/home`) exists. Renders `<HomePage />` placeholder for now (just "Welcome {name}" + link to library — slice 04 fills with shelves).
2. **Authenticated user visiting `/`** is redirected to `/{lang}/home`:
   - Client-side redirect via React Router `<Navigate replace>` (locked-in decision #1 in README).
   - Renders skeleton during the auth-context boot to avoid a flash of marketing content.
3. **Unauthenticated visitor at `/`** sees current marketing hero unchanged.
4. **Crawler / bot at `/`** sees marketing hero (NOT redirect to /home — bots aren't authenticated).
   - Verified via nginx bot detection (per CLAUDE.md) — bots route to SSG which has marketing hero baked.
   - Auth check happens in client JS; SSG/bot path skips it.
5. `/home` is gated to authenticated users:
   - Unauthenticated visit to `/home` redirects to `/login?next=/home`.
   - After login, user lands on `/home`.
6. Mobile equivalent: bottom-tab "Home" (added in slice 01) navigates to `/home`. Same auth gate applies.
7. Telemetry: emit `home.landed` (auth state, source: direct nav vs redirect).
8. Behind `myBooksV3.stateAwareLanding`. When OFF, `/` behaves as today (marketing for everyone), `/home` is just an additional optional page.

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/pages/HomePage.tsx` | **New** — placeholder. Renders "Welcome {firstName}" + 3 buttons: Library, Discover, Vocab. Slice 04 replaces body with shelves. |
| `apps/web/src/App.tsx` | Add `/{lang}/home` route. Update `/{lang}` (marketing) component to detect auth and redirect if flag enabled. |
| `apps/web/src/components/auth/RequireAuth.tsx` (or similar) | Reused / new — guard for `/home`. |
| `apps/web/src/lib/features.ts` | Add `myBooksV3.stateAwareLanding` flag. |
| `apps/web/src/lib/telemetry/myBooksV3.ts` | Emit `home.landed` event. |
| `apps/mobile/app/(tabs)/home.tsx` | Replace placeholder from slice 01 with same "Welcome" + library link content. |
| `apps/web/src/components/HomeRedirect.tsx` (or inline in marketing page) | Logic: if auth + flag on → `<Navigate to="/{lang}/home" replace />`, else render marketing children. |
| `apps/web/src/locales/en.json` + mobile | `home.welcome`, `home.placeholder.library`, `home.placeholder.discover`, `home.placeholder.vocab`. |
| `infra/env/...` | Add `VITE_FEATURE_MYBOOKSV3_STATE_AWARE_LANDING=true`. |

## Implementation notes

- **Redirect implementation pattern (React Router 6):**
  ```tsx
  function MarketingOrHomeRedirect() {
    const { isAuthenticated, isLoading } = useAuth()
    const lang = useLanguageContext()
    
    if (isLoading) return <PageSkeleton />  // avoid flash
    
    if (isAuthenticated && features.myBooksV3.stateAwareLanding) {
      return <Navigate to={`/${lang}/home`} replace />
    }
    
    return <MarketingPage />  // current homepage content
  }
  ```
  Mount at `path="/:lang"` index route.
- **`replace`** in `<Navigate>` matters — back button shouldn't return to `/` and re-trigger redirect loop.
- **Loading state** is critical — without it, marketing renders briefly then redirects, jarring. Show skeleton matching marketing layout dimensions to avoid layout shift.
- **Bot detection interplay:**
  - Bots hit `/`, nginx detects user-agent, serves pre-rendered SSG HTML for marketing.
  - SSG was built without auth context → renders marketing always.
  - Real browsers: nginx serves SPA shell, React detects auth, redirects if needed.
  - **Verify:** `curl -A "Googlebot" https://textstack.app/en` returns marketing HTML (not redirect). `curl -A "Mozilla/5.0..." https://textstack.app/en` returns SPA shell.
- **Loop guard:** add safety check that redirect target (`/home`) doesn't itself redirect back. The auth gate on /home should redirect to login, not to /.
- **Future:** slice 04 fills HomePage with shelves; this slice ships the route shell so the redirect has a destination.

## Out of scope

- Smart shelves on /home (slice 04).
- Header changes (slice 01).
- /discover URL change (slice 02).

## Tests

**Unit:**
- `HomePage.test.tsx`: renders welcome message with user name; placeholder buttons visible.
- `MarketingOrHomeRedirect.test.tsx`: shows skeleton while loading, navigates when auth + flag, renders marketing otherwise.

**E2E:**
- `apps/web/e2e/tests/state-aware-landing.spec.ts` (new):
  - Logged-out user visits `/en` → marketing hero visible, no redirect.
  - Logged-in user visits `/en` → redirected to `/en/home` → welcome message visible.
  - Bot user-agent visits `/en` → marketing hero (no redirect, no client JS executed).
  - Unauth visit to `/en/home` → redirected to login.
- Mobile E2E: similar flow on mobile bottom tab.

**Manual:**
- DevTools Network tab on `/en` while logged in: should see one redirect to `/home`, no infinite loop.

## Done criterion

```bash
pnpm -C apps/web test --filter "HomePage|MarketingOrHomeRedirect"
pnpm -C apps/web test:e2e --grep "state-aware-landing"
pnpm -C apps/web build
cd apps/mobile && npx tsc --noEmit

# Bot detection sanity
curl -sA "Googlebot/2.1" https://textstack.app/en | grep -c "Finish the book"  # should be > 0
curl -sA "Mozilla/5.0" https://textstack.app/en | grep -c "Finish the book"  # depends on SSG fallback

# Manual: log in as test user, visit https://textstack.app/en — should redirect to /en/home within 200ms
```

## Rollback plan

Toggle `VITE_FEATURE_MYBOOKSV3_STATE_AWARE_LANDING=false`. Marketing page renders for everyone again. `/home` still exists as an optional page accessible via direct URL or header link.

## Follow-ups

- Slice 04 fills HomePage with shelves.
- Future: server-side redirect at edge (cleaner, eliminates skeleton flash). Defer — client-side is fine for v3.
- Track `home.landed` with `source` attribution to understand if users navigate to `/home` directly (header/bookmark) vs via redirect.
