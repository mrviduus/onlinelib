# Slice 05 — Continue Reading shelf at top of Library

**Phase:** 2 (Library MVP) · **Estimated:** 1 day · **Risk:** low · **Flag:** `myBooksV2.continueReading`

## Goal

Surface the user's last-opened books at the top of the Library page as a horizontal "Continue Reading" shelf. One tap → resume reading. This is the #1 reason a user opens Library — make that path instant.

Today: Continue Reading widget exists on `/` (homepage) but NOT inside Library. Users opening Library to resume a book must scan the grid.

## Acceptance criteria

1. Library page renders a horizontal shelf above the existing tabs/grid showing the user's last 5 opened books (uploaded OR saved, mixed).
2. Each shelf item shows: cover (large, ~140×210), title, author, % progress as filled bar under cover.
3. Tap/click → navigates straight to last reading position (re-uses existing reader resume logic).
4. Shelf is hidden if user has 0 books with reading progress.
5. Shelf scrolls horizontally on desktop (mouse wheel maps to horizontal scroll inside shelf), and is swipeable on mobile.
6. Shelf items are sorted by `last_opened_at DESC`. Ties broken by `progress_updated_at DESC`.
7. The first item is visually emphasized (slightly larger, "Continue" badge) — the most recent read.
8. Behind feature flag `myBooksV2.continueReading`.

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/components/library/ContinueReadingShelf.tsx` | **New.** Component that fetches + renders the shelf. |
| `apps/web/src/pages/LibraryPage.tsx` | Mount `<ContinueReadingShelf />` above tabs container. |
| `apps/web/src/hooks/useContinueReading.ts` | **New.** Hook that returns `{ items, loading }`. Combines `libraryApi.getLibrary()` + `userBooksApi.getUserBooks()` + `readingProgressApi.getAllProgress()`, filters to non-zero progress, sorts. |
| `apps/mobile/src/components/library/ContinueReadingShelf.tsx` | **New.** Mobile equivalent — `<ScrollView horizontal>` based. |
| `apps/mobile/app/(tabs)/library.tsx` | Mount mobile shelf. |
| `apps/web/src/styles/library.css` | Shelf layout, item card sizing, scroll behavior. |
| Backend (optional, recommended): `backend/src/Api/Endpoints/UserBooksEndpoints.cs` | Add `GET /me/library/continue-reading?limit=5` endpoint that returns combined sorted list. Avoids 3 client-side fetches. |

## Implementation notes

- **Server-side endpoint preferred.** Currently the data lives in three places (admin library saves, user uploads, progress table). Hitting all three on every Library render is wasteful and order-dependent. Add a server endpoint that joins them and returns a `ContinueReadingItemDto[]`:
  ```csharp
  public record ContinueReadingItemDto(
    Guid Id,
    string Type,           // "edition" | "userbook"
    string Title,
    string Author,
    string? CoverPath,
    decimal ProgressPercent,
    DateTime LastOpenedAt,
    string ResumeUrl       // pre-built href like "/en/library/my/{id}/read/{chapter}"
  );
  ```
- **Cache-friendly.** Mark response `Cache-Control: private, max-age=30`. Continue Reading doesn't need to be real-time fresh.
- **Empty state:** if user has saved books but no progress, hide the shelf entirely. Don't show "Start a book to see it here" — that's noise.
- **First-item emphasis:** subtle — 1.05× scale, bold "Continue" badge top-right corner. Not garish.
- **Horizontal scroll on desktop:** use `overflow-x: auto` with momentum scrolling (`scroll-behavior: smooth`). Add left/right arrow buttons that appear on hover for accessibility.
- **Mobile swipe:** `<ScrollView horizontal showsHorizontalScrollIndicator={false} pagingEnabled={false} decelerationRate="fast">`.

## Out of scope

- Real-time updates when progress changes during the same Library page visit (next visit will reflect — fine).
- "Recommended next read" — out of scope, that's content recs not progress.
- Shelf for Saved-but-not-started books (different concept).

## Tests

**Unit:**
- `useContinueReading.test.ts`: returns merged sorted list, filters out zero-progress, respects limit.
- `ContinueReadingShelf.test.tsx`: renders empty state correctly, renders 5 items, click navigates to resume URL.

**E2E:**
- Sign in as user with 3+ books in progress → /library → assert shelf visible with correct order → click first → land on correct chapter at correct position.

## Done criterion

```bash
pnpm -C apps/web test --filter "ContinueReading"
pnpm -C apps/web test:e2e --grep "continue-reading"
pnpm -C apps/web build
dotnet test tests/TextStack.IntegrationTests --filter ContinueReading

# Manual: account with 5+ progressed books, /library shows correctly ordered shelf, mobile swipes smoothly
```

## Rollback plan

Toggle `myBooksV2.continueReading` to `false`. New backend endpoint stays (additive), shelf component does not render.

## Follow-ups

- Add same shelf to homepage as a replacement for current single "Continue Reading" widget.
- Consider "Just for you" recommendation row below this shelf — Phase 4+ scope.
