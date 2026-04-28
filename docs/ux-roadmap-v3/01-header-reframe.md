# Slice 01 — Header reframe (Home / Library / Discover / + ▾)

**Phase:** 1 (IA foundation) · **Estimated:** 2 days · **Risk:** medium · **Flag:** `myBooksV3.headerReframe`

## Goal

Restructure primary navigation to reflect what each item is for:
- **Home** — personal landing surface (smart shelves of YOUR content) [requires slice 03+04 to land]
- **Library** — full grid of YOUR content
- **Discover** — public catalog (renamed from "Books") — secondary, but still visible
- **+ ▾** — add-content menu (slice 07 fills it; here just placeholder for Upload)

Move profile-related links (My Library, Highlights, Vocabulary) **out** of avatar dropdown — they belong in primary nav now.

Mobile bottom-tabs get the same treatment in this slice (the deferred v2 slice 03 collapses into here).

## Acceptance criteria

### Web

1. Header item order (left-to-right): `TextStack` logo · **Home** · **Library** · **Discover** · **Vocabulary** · `+` button · 🌓 theme · 👤 avatar.
2. **About** link removed from header (moves to footer if not already).
3. **"Books"** label changed to **"Discover"** everywhere in header. Internal route still works (slice 02 handles URL migration).
4. Avatar dropdown loses: **My Library**, **Highlights**, **Vocabulary**, **My Language** (now in primary nav or `/profile` page).
5. Avatar dropdown keeps: **Edit profile**, **Sign out**.
6. **Home** link only renders for authenticated users. For unauth — header starts with logo · Discover · About · Sign in.
7. Click on logo behavior: authenticated → goto `/home`, unauthenticated → goto `/` (marketing).

### Mobile (lockstep with web)

8. Bottom tabs reordered to: **Home | Discover | + | Library | Vocab** (5 tabs, `+` raised center per v2 slice 03 spec).
9. **Profile tab removed** from bottom nav; profile accessible via avatar in header of each tab.
10. For unauth users: bottom tabs become **Home | Discover | Sign in** (3-tab fallback).

### Telemetry

11. Add `apps/web/src/lib/telemetry/myBooksV3.ts` (new) with events: `header.click`, `header.search.opened`, payload includes which item clicked.
12. Track baseline header click distribution for 7 days post-launch — informs whether reframe actually shifted user behavior.

### Flag

13. Behind `myBooksV3.headerReframe`. When OFF, old header structure renders. Flag must be added to prod env (per Definition-of-done convention 0).

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/components/Header.tsx` | Major restructure. New nav items, conditional render for authenticated state. |
| `apps/web/src/components/auth/UserMenu.tsx` | Remove migrated items from dropdown. Keep Edit profile + Sign out. |
| `apps/web/src/components/library/UploadButton.tsx` | Stays for now (slice 07 turns it into `<AddMenu>`). Reposition to new spot. |
| `apps/web/src/styles/header.css` | Updated layout for new item count. |
| `apps/mobile/app/(tabs)/_layout.tsx` | Reorder tabs to `Home / Discover / + / Library / Vocab`. Add Home tab if missing. |
| `apps/mobile/app/(tabs)/home.tsx` | **New** placeholder — slice 03+04 will populate. For now: "Welcome" + redirect to library. |
| `apps/mobile/src/components/UploadTabButton.tsx` | **New** — raised center upload tab (port of v2 slice 03 brief). |
| `apps/web/src/lib/features.ts` | Re-introduce features.ts (was deleted in v2 cleanup) with `myBooksV3.headerReframe` flag. |
| `apps/web/src/lib/telemetry/myBooksV3.ts` | **New** telemetry module. |
| `apps/web/src/locales/en.json` + mobile | Add nav labels: `nav.home`, `nav.library`, `nav.discover`. |
| `infra/env/myBooksV3-rollout.env` (or wherever prod env lives) | Add `VITE_FEATURE_MYBOOKSV3_HEADER_REFRAME=true`. |

## Implementation notes

- **`/home` route doesn't exist yet** — slice 03 creates it. For this slice, `Home` link can target `/library` as fallback OR the slice ships behind a flag that's only turned on AFTER slice 03+04 land. Recommended: ship slice 01 with flag OFF in prod, only enable AFTER slice 04 ships. This keeps slice 01 mergeable independently.
- **Logo click logic** — use `useAuth()` inside Logo component. If `isAuthenticated`, `to="/home"`, else `to="/"`.
- **Mobile Home tab** — placeholder fine for now. Just renders existing Library content with title "Home" until slice 04 puts shelves there.
- **Admin link?** — if header currently shows admin link conditionally, preserve. Check `apps/web/src/components/Header.tsx` for `isAdmin` branches.
- **i18n strings** — `nav.about` becomes unused; mark for removal in slice 08 cleanup.
- **Reintroducing features.ts** — v2 cleanup removed it. v3 needs it again. Use same pattern: `env('VITE_FEATURE_*') ?? isDev`. Document in PR that this is intentional re-add.

## Out of scope

- `/home` page content (slices 03-04).
- `/discover` URL changes (slice 02).
- `+` menu options beyond Upload (slice 07).
- Library page restructure (slices 05-06).

## Tests

**Unit:**
- `Header.test.tsx`: renders correct item set per auth state; flag OFF preserves old structure; logo click goes to right route.
- `UserMenu.test.tsx`: dropdown does NOT show migrated items; preserves Edit profile + Sign out.

**E2E:**
- Logged-in user visits `/`: sees "Home" link, clicks it → lands somewhere reasonable (per fallback behavior).
- Unauth user visits `/`: sees "Discover" not "Books"; "Home" not visible.
- Mobile: 5 bottom tabs visible in correct order; + tab is raised; profile not in tabs.

## Done criterion

```bash
pnpm -C apps/web test --filter "Header|UserMenu"
pnpm -C apps/web test:e2e --grep "header-reframe"
pnpm -C apps/web build
cd apps/mobile && npx tsc --noEmit
cd apps/mobile && npx playwright test --grep "tabs-layout"

# Manual smoke (record in PR)
# - /en logged-in: new header order, Home link present
# - /en logged-out: no Home, sees Discover
# - Mobile: 5 tabs in order Home/Discover/+/Library/Vocab
# - Toggle flag off → old header restores
```

## Rollback plan

Toggle `VITE_FEATURE_MYBOOKSV3_HEADER_REFRAME=false` in prod env, redeploy. Old header with avatar dropdown returns. No data changes.

## Follow-ups

- Slice 03 enables Home link as live destination.
- Slice 07 turns + button into a proper menu.
- Slice 08 cleanup removes the flag and old code paths.
