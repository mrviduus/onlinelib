# Slice 02 — Smart shelves at top of Library

**Phase:** 1 (Library landing) · **Estimated:** 2 days · **Risk:** low · **Flag:** `myBooksV3.libraryShelves`

## Goal

Add 4 **smart shelves** to the TOP of `/library` (above the existing grid) — Continue Reading, Recently Added, Quick Reads, Finished This Month. Inspired by Readwise Reader Home (research doc). The Library page becomes the user's personalized landing surface from day one — shelves at top, full grid below.

## Acceptance criteria

1. `/library` renders 4 default shelves above the existing grid, in vertical stack:
   - **📖 Continue reading** — books with progress > 0 AND < 95%, sorted by `lastOpenedAt DESC`, limit 10.
   - **✨ Recently added** — uploaded OR saved-from-catalog within last 14 days, sorted by `createdAt DESC`, limit 10.
   - **⏱ Quick reads** — books estimated ≤ 1 hour to finish at user's pace, not started or reading, limit 10.
   - **🏆 Finished this month** — books marked `IsFinished` within current month, sorted by `finishedAt DESC`, limit 10.
2. Each shelf:
   - Title + emoji + descriptive subtitle ("Saved in past 14 days")
   - Horizontal scrollable carousel of cover cards (140×210 desktop, 120×180 mobile)
   - Left/right arrow buttons on desktop hover (swipe on mobile)
   - "View all →" link at end of each carousel routing to `/library?filter=<corresponding-filter>` (scrolls to filtered grid below)
3. Shelf is hidden if it has 0 items (don't show empty shelf headers).
4. **First-visit empty state:** if user has 0 books across ALL shelves → render full-screen "Add your first book" CTA with upload button + "Or browse the catalog →" link to `/books`. Existing grid hidden in this state.
5. Welcome message above shelves: `"Welcome back, {firstName}"` (or `"Welcome, {firstName}"` on first ever visit).
6. Below shelves: existing Library grid renders unchanged. Shelves do not replace it — they preview it.
7. Mobile: same 4 shelves, same logic, vertical stack of horizontal carousels. Existing mobile library grid renders unchanged below.
8. Endpoint: `GET /me/library/shelves` returns `{ continueReading, recentlyAdded, quickReads, finishedThisMonth }` in single call. Response cached 60s server-side per user.
9. Behind `myBooksV3.libraryShelves`. When OFF, `/library` renders only the existing grid (no shelves).

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/pages/LibraryPage.tsx` | Add `<LibraryShelves />` at top, behind flag. Existing grid stays. |
| `apps/web/src/components/library/LibraryShelves.tsx` | **New** — fetches data, renders 4 shelves. |
| `apps/web/src/components/library/LibraryShelf.tsx` | **New** — single shelf component with carousel. |
| `apps/web/src/components/library/LibraryEmptyState.tsx` | **New** — first-visit CTA (replaces grid when ALL shelves empty). |
| `apps/web/src/hooks/useLibraryShelves.ts` | **New** — fetch + cache. |
| `apps/mobile/app/(tabs)/library.tsx` | Mirror — same shelves above existing grid. |
| `apps/mobile/src/components/library/LibraryShelf.tsx` | **New** RN equivalent. |
| Backend: `backend/src/Api/Endpoints/LibraryEndpoints.cs` | **New** — `GET /me/library/shelves` endpoint. |
| Backend: `backend/src/Application/Library/LibraryShelvesService.cs` | **New** — aggregation service. |
| Backend: `backend/src/Contracts/Library/LibraryShelvesDto.cs` | **New** — DTO with 4 shelf arrays. |
| `apps/web/src/locales/en.json` + `packages/shared/src/i18n/en.json` | All shelf titles, subtitles, CTAs under `library.shelves.*`. |
| `apps/web/src/lib/features.ts` | Add `myBooksV3.libraryShelves` flag. |
| `apps/mobile/src/lib/features.ts` | Add `myBooksV3LibraryShelves` flag. |
| `.github/workflows/deploy.yml` | Set `VITE_FEATURE_MYBOOKSV3_LIBRARY_SHELVES=false` for prod (default OFF). |

## Implementation notes

- **Single backend endpoint** — DON'T call 4 endpoints from the client. One aggregated endpoint with one DB query (or 4 queries inside a service). Saves round-trips and gives consistent snapshot.
- **DTO shape:**
  ```csharp
  public record LibraryShelvesDto(
    List<LibraryShelfItem> ContinueReading,
    List<LibraryShelfItem> RecentlyAdded,
    List<LibraryShelfItem> QuickReads,
    List<LibraryShelfItem> FinishedThisMonth
  );

  public record LibraryShelfItem(
    Guid Id,
    string Type,           // "userbook" | "savedbook"
    string Title,
    string Author,
    string CoverPath,
    decimal ProgressPercent,
    DateTime? LastOpenedAt,
    DateTime CreatedAt,
    int? EstimatedMinutesRemaining,   // null if unknown
    string ReadHref,        // pre-built /library/my/{id}/read/... or /books/{slug}/read/...
    string DetailHref       // /library/my/{id} or /books/{slug}
  );
  ```
- **Quick reads logic:** `EstimatedMinutesRemaining ≤ 60` AND `progressPercent < 95`. Reuse `useReadingPace` from v2 slice 19.
- **Progress not loaded for unstarted books** — for `Recently added`, fall back to `progressPercent = 0`.
- **Performance:** batch fetch via `LEFT JOIN` to avoid N+1. If becomes slow at 500+ books per user, add covering index on `(user_id, last_opened_at)` and `(user_id, created_at)`.
- **Carousel:** use `<div style="overflow-x: auto">` with `scroll-snap-type: x mandatory` for native feel. Desktop arrows appear on hover via CSS `:has(.shelf:hover)`.
- **"View all →"** maps to:
  - Continue reading → `/library?filter=reading`
  - Recently added → `/library?sort=created_desc`
  - Quick reads → `/library?filter=quick-reads` (new filter, may need slice 04 update)
  - Finished this month → `/library?filter=finished&period=month`
- **Empty state:** ALL 4 shelves empty AND grid empty → show big CTA. If even one shelf has items, render shelves + grid normally.
- **Order on page:** Welcome → Shelves stack → existing Library grid (status tabs, source filter, search). Shelves are a preview band; grid remains the workhorse.

## Out of scope

- User-configurable shelves ("Configure" button per Readwise) — defer to future slice. Default 4 shelves are enough.
- Shelf reordering by drag — future.
- AI-recommended "For you" shelf based on similarity — out of scope, requires ML.
- Restructuring the existing Library grid below the shelves — covered in slices 03/04.

## Tests

**Unit:**
- `LibraryShelvesService.test.cs`: each shelf query returns correct items per fixtures; respects user scope; 60s cache.
- `useLibraryShelves.test.ts`: fetches once, caches 60s, refetches on cache expiry.
- `LibraryShelf.test.tsx`: renders carousel, hides if empty, renders "View all" link.
- `LibraryPage.test.tsx`: flag ON renders shelves above grid; flag OFF renders only grid.

**Integration:**
- `dotnet test tests/TextStack.IntegrationTests --filter LibraryShelves`: endpoint returns expected shape; permissions enforced (other user's bookId never appears).

**E2E:**
- Test user with 5 books mixed states → `/library` shows shelves at top + full grid below.
- Test user with 0 books → `/library` shows full empty state CTA (no grid, no shelves).
- Click "View all" on Continue Reading → URL becomes `/library?filter=reading`, grid filters accordingly.
- Mobile: scroll through shelves vertically, swipe carousels horizontally, no horizontal page scroll triggered. Grid still reachable below.

## Done criterion

```bash
pnpm -C apps/web test --filter "LibraryShelves|LibraryShelf|useLibraryShelves|LibraryPage"
pnpm -C apps/web test:e2e --grep "library-shelves"
pnpm -C apps/web build
dotnet test tests/TextStack.IntegrationTests --filter LibraryShelves
cd apps/mobile && npx tsc --noEmit

# Performance: user with 100 books, /me/library/shelves response < 200ms
ab -n 50 -c 5 -H "Authorization: Bearer $TOKEN" https://textstack.app/api/me/library/shelves
```

## Rollback plan

Toggle `VITE_FEATURE_MYBOOKSV3_LIBRARY_SHELVES=false` in prod env, redeploy. `/library` reverts to grid-only. Backend endpoint stays (additive, harmless).

## Follow-ups

- User-configurable shelves (let user pick which appear, in what order) — Phase 4 polish.
- Per-shelf settings (e.g. "show only books in my native language" filter) — future.
- "Recently saved from catalog" sub-shelf — adds catalog discovery surface to library.
