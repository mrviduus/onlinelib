# Slice 01 — Header reframe (Library / Books / Vocabulary / + ▾)

**Phase:** 1 (Library as personal workspace) · **Estimated:** 2 days · **Risk:** medium · **Flag:** `myBooksV3.headerReframe`

## Goal

Restructure primary navigation so the user's **Library** is primary and the public catalog (**Books**) is a sibling — same URL `/books/*`, same label.

- **Library** — full grid + smart shelves (slice 02) of YOUR content
- **Books** — public catalog (label unchanged, URL unchanged)
- **+ ▾** — add-content menu (slice 05 fills it; here just placeholder for Upload)

Move profile-related links (My Library, Highlights, Vocabulary) **out** of avatar dropdown — they belong in primary nav now.

Mobile bottom-tabs get the same treatment in this slice (the deferred v2 slice 03 collapses into here).

## Acceptance criteria

### Web

1. Header item order (left-to-right): `TextStack` logo · **Library** · **Books** · **Vocabulary** · `+` button · 🌓 theme · 👤 avatar.
2. **About** link removed from header (moves to footer if not already).
3. **"Books"** label and `/books/*` route stay unchanged. (No `/discover` rename — see locked-in decision in README.)
4. Avatar dropdown loses: **My Library**, **Highlights**, **Vocabulary**, **My Language** (now in primary nav or `/profile` page).
5. Avatar dropdown keeps: **Edit profile**, **Sign out**.
6. **Library** link only renders for authenticated users. For unauth — header starts with logo · Books · About · Sign in.
7. Click on logo behavior: authenticated → goto `/library`, unauthenticated → goto `/` (marketing). Implemented via `useAuth()` inside the brand link.

### Mobile (lockstep with web)

8. Bottom tabs reordered to: **Read | Books | + | Library | Vocab** (5 tabs, `+` raised center per v2 slice 03 spec). Library sits in the right half so a one-handed thumb finds it; Read keeps the left-most slot for first-launch familiarity.
9. **Profile tab removed** from bottom nav; profile accessible via avatar in header of each tab.
10. For unauth users: bottom tabs become **Read | Books | Sign in** (3-tab fallback).

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
| `apps/web/src/components/library/UploadButton.tsx` | Stays for now (slice 05 turns it into `<AddMenu>`). Reposition to new spot. |
| `apps/web/src/styles/header.css` | Updated layout for new item count. |
| `apps/mobile/app/(tabs)/_layout.tsx` | Reorder tabs to `Read / Books / + / Library / Vocab`. |
| `apps/mobile/src/components/UploadTabButton.tsx` | **New** — raised center upload tab (port of v2 slice 03 brief). |
| `apps/web/src/lib/features.ts` | Re-introduce features.ts (was deleted in v2 cleanup) with `myBooksV3.headerReframe` flag. |
| `apps/web/src/lib/telemetry/myBooksV3.ts` | **New** telemetry module. |
| `apps/web/src/locales/en.json` + mobile | Add nav label `nav.library`. (`nav.books` already exists.) |
| `infra/env/myBooksV3-rollout.env` (or wherever prod env lives) | Add `VITE_FEATURE_MYBOOKSV3_HEADER_REFRAME=true`. |

## Implementation notes

- **Logo click logic** — use `useAuth()` inside the brand link. If `isAuthenticated`, `to="/library"`, else `to="/"`.
- **Books label** — stays "Books" in DiscoverMenu trigger (and elsewhere). No copy change.
- **Admin link?** — if header currently shows admin link conditionally, preserve. Check `apps/web/src/components/Header.tsx` for `isAdmin` branches.
- **i18n strings** — `nav.about` becomes unused in primary nav; mark for removal in slice 06 cleanup.
- **Reintroducing features.ts** — v2 cleanup removed it. v3 needs it again. Use same pattern: `env('VITE_FEATURE_*') ?? isDev`. Document in PR that this is intentional re-add.

## Out of scope

- Smart shelves on `/library` (slice 02).
- `+` menu options beyond Upload (slice 05).
- Library page restructure (slices 03-04).

## Tests

**Unit:**
- `Header.test.tsx`: renders correct item set per auth state; flag OFF preserves old structure; logo click goes to right route.
- `UserMenu.test.tsx`: dropdown does NOT show migrated items; preserves Edit profile + Sign out.

**E2E:**
- Logged-in user visits `/`: sees "Library" link, clicks it → lands on `/library`.
- Unauth user visits `/`: sees "Books"; "Library" not visible.
- Mobile: 5 bottom tabs visible in correct order; + tab is raised; profile not in tabs.

## Done criterion

```bash
pnpm -C apps/web test --filter "Header|UserMenu"
pnpm -C apps/web test:e2e --grep "header-reframe"
pnpm -C apps/web build
cd apps/mobile && npx tsc --noEmit
cd apps/mobile && npx playwright test --grep "tabs-layout"

# Manual smoke (record in PR)
# - /en logged-in: new header order, Library link present, logo → /library
# - /en logged-out: no Library, sees Books
# - Mobile: 5 tabs in order Read/Books/+/Library/Vocab
# - Toggle flag off → old header restores
```

## Rollback plan

Toggle `VITE_FEATURE_MYBOOKSV3_HEADER_REFRAME=false` in prod env, redeploy. Old header with avatar dropdown returns. No data changes.

## Follow-ups

- Slice 02 fills `/library` with smart shelves at top.
- Slice 05 turns + button into a proper menu.
- Slice 06 cleanup removes the flag and old code paths.
