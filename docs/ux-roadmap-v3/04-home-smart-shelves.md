# Slice 04 — Smart shelves on /home

**Phase:** 1 (IA foundation) · **Estimated:** 2 days · **Risk:** low · **Flag:** `myBooksV3.homeShelves`

## Goal

Replace the `/home` placeholder (slice 03) with **smart shelves** of the user's content — Continue Reading, Recently Added, Quick Reads, Long Reads. Inspired by Readwise Reader Home (research doc). This is the surface logged-in users see first; it must feel personalized and useful from day one.

## Acceptance criteria

1. `/home` renders 4 default shelves in vertical stack:
   - **📖 Continue reading** — books with progress > 0 AND < 95%, sorted by `lastOpenedAt DESC`, limit 10.
   - **✨ Recently added** — uploaded OR saved-from-catalog within last 14 days, sorted by `createdAt DESC`, limit 10.
   - **⏱ Quick reads** — books estimated ≤ 1 hour to finish at user's pace, not started or reading, limit 10.
   - **🏆 Finished this month** — books marked `IsFinished` within current month, sorted by `finishedAt DESC`, limit 10.
2. Each shelf:
   - Title + emoji + descriptive subtitle ("Saved in past 14 days")
   - Horizontal scrollable carousel of cover cards (140×210 desktop, 120×180 mobile)
   - Left/right arrow buttons on desktop hover (swipe on mobile)
   - "View all →" link at end of each carousel routing to `/library?filter=<corresponding-filter>`
3. Shelf is hidden if it has 0 items (don't show empty shelf headers).
4. **First-visit empty state:** if user has 0 books across ALL shelves → render full-screen "Add your first book" CTA with upload button + "Or browse Discover →" link.
5. Welcome message above shelves: `"Welcome back, {firstName}"` (or "Welcome, {firstName}" on first ever visit).
6. Below shelves: small "💡 Tip: Press Cmd+K for command palette" footer hint (if user is on web).
7. Mobile: same 4 shelves, same logic, vertical scroll instead of separate carousels (single column of horizontal carousels stacked).
8. Endpoint: `GET /me/home/shelves` returns `{ continueReading, recentlyAdded, quickReads, finishedThisMonth }` in single call.
9. Response cached 60s server-side per user.
10. Behind `myBooksV3.homeShelves`. When OFF, `/home` shows slice 03 placeholder.

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/pages/HomePage.tsx` | Major rewrite — replace placeholder with `<HomeShelves />`. |
| `apps/web/src/components/home/HomeShelves.tsx` | **New** — fetches data, renders 4 shelves. |
| `apps/web/src/components/home/HomeShelf.tsx` | **New** — single shelf component with carousel. |
| `apps/web/src/hooks/useHomeShelves.ts` | **New** — fetch + cache. |
| `apps/web/src/components/home/HomeEmptyState.tsx` | **New** — first-visit CTA. |
| `apps/mobile/app/(tabs)/home.tsx` | Mirror — same shelves, vertical layout. |
| `apps/mobile/src/components/home/HomeShelf.tsx` | **New** RN equivalent. |
| Backend: `backend/src/Api/Endpoints/HomeEndpoints.cs` | **New** — `GET /me/home/shelves` endpoint. |
| Backend: `backend/src/Application/Home/HomeShelvesService.cs` | **New** — aggregation service. |
| Backend: `backend/src/Contracts/Home/HomeShelvesDto.cs` | **New** — DTO with 4 shelf arrays. |
| `apps/web/src/locales/en.json` + mobile | All shelf titles, subtitles, CTAs. |
| `infra/env/...` | `VITE_FEATURE_MYBOOKSV3_HOME_SHELVES=true`. |

## Implementation notes

- **Single backend endpoint** — DON'T call 4 endpoints from the client. One aggregated endpoint with one DB query (or 4 queries inside a service). Saves round-trips and gives consistent snapshot.
- **DTO shape:**
  ```csharp
  public record HomeShelvesDto(
    List<HomeShelfItem> ContinueReading,
    List<HomeShelfItem> RecentlyAdded,
    List<HomeShelfItem> QuickReads,
    List<HomeShelfItem> FinishedThisMonth
  );
  
  public record HomeShelfItem(
    Guid Id,
    string Type,           // "userbook" | "savedbook"
    string Title,
    string Author,
    string CoverPath,
    decimal ProgressPercent,
    DateTime? LastOpenedAt,
    DateTime CreatedAt,
    int? EstimatedMinutesRemaining,   // null if unknown
    string ReadHref,        // pre-built /library/my/{id}/read/... or similar
    string DetailHref       // /library/my/{id} or /discover/{slug}
  );
  ```
- **Quick reads logic:** `EstimatedMinutesRemaining ≤ 60` AND `progressPercent < 95`. Reuse `useReadingPace` from v2 slice 19.
- **Progress not loaded for unstarted books** — for `Recently added`, fall back to `progressPercent = 0`.
- **Performance:** batch fetch via `LEFT JOIN` to avoid N+1. If becomes slow at 500+ books per user, add covering index on `(user_id, last_opened_at)` and `(user_id, created_at)`.
- **Carousel:** use `<div style="overflow-x: auto">` with `scroll-snap-type: x mandatory` for native feel. Desktop arrows appear on hover via CSS `:has(.shelf:hover)`.
- **"View all →"** maps to:
  - Continue reading → `/library?filter=reading`
  - Recently added → `/library?sort=created_desc`
  - Quick reads → `/library?filter=quick-reads` (new filter, may need slice 06 update)
  - Finished this month → `/library?filter=finished&period=month`
- **Empty state:** ALL 4 shelves empty → show big CTA. If even one has items, show shelves (don't mix empty + populated).

## Out of scope

- User-configurable shelves ("Configure" button per Readwise) — defer to future slice. Default 4 shelves are enough.
- Shelf reordering by drag — future.
- AI-recommended "For you" shelf based on similarity — out of scope, requires ML.

## Tests

**Unit:**
- `HomeShelvesService.test.cs`: each shelf query returns correct items per fixtures; respects user scope; 60s cache.
- `useHomeShelves.test.ts`: fetches once, caches 60s, refetches on cache expiry.
- `HomeShelf.test.tsx`: renders carousel, hides if empty, renders "View all" link.

**Integration:**
- `dotnet test tests/TextStack.IntegrationTests --filter HomeShelves`: endpoint returns expected shape; permissions enforced (other user's bookId never appears).

**E2E:**
- Test user with 5 books mixed states → /home shows correct shelves with correct items.
- Test user with 0 books → /home shows full empty state CTA.
- Click "View all" on Continue Reading → lands on /library with filter=reading.
- Mobile: scroll through shelves vertically, swipe carousels horizontally, no horizontal page scroll triggered.

## Done criterion

```bash
pnpm -C apps/web test --filter "HomeShelves|HomeShelf|useHomeShelves"
pnpm -C apps/web test:e2e --grep "home-shelves"
pnpm -C apps/web build
dotnet test tests/TextStack.IntegrationTests --filter HomeShelves
cd apps/mobile && npx tsc --noEmit

# Performance: user with 100 books, /me/home/shelves response < 200ms
ab -n 50 -c 5 -H "Authorization: Bearer $TOKEN" https://textstack.app/api/me/home/shelves
```

## Rollback plan

Toggle `VITE_FEATURE_MYBOOKSV3_HOME_SHELVES=false`. /home reverts to slice 03 placeholder. Backend endpoint stays (additive).

## Follow-ups

- User-configurable shelves (let user pick which appear, in what order) — Phase 4 polish.
- Per-shelf settings (e.g. "show only books in my native language" filter) — future.
- "Recently saved from catalog" sub-shelf — adds catalog discovery surface to home.
