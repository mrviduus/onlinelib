# Slice 06 — Cover grid with progress + status badges

**Phase:** 2 (Library MVP) · **Estimated:** 1 day · **Risk:** low · **Flag:** none (visual upgrade to existing component)

## Goal

Make the existing book grid Kindle-quality: covers larger, % progress visible directly on cover, status badges (Reading / Finished / Processing / Failed) clear at a glance.

Today: `UserBookCard` shows cover + title + author + a progress bar below. Status (Processing/Failed) is shown but visually weak. Grid view feels list-y.

## Acceptance criteria

1. Grid view default cover size: 160×240 on desktop, 120×180 on mobile. List view unchanged in dimensions.
2. Progress overlay on cover:
   - 0% → no overlay
   - 1–99% → bottom edge has a thin horizontal bar filled to %; bar color = accent
   - 100% → green checkmark badge top-right
3. Status badges (top-left of cover, small pill):
   - `Processing` → animated pulse, "Processing…" text + spinner
   - `Failed` → red, "Failed" text, tappable to retry
   - `Ready` (most books) → no badge
4. Recently uploaded books (added within last 24h) show a small "New" pill on top-left if status is `Ready` (mutually exclusive with Processing/Failed badge).
5. Hover on desktop cover: subtle lift (translateY −2px, shadow grows). Mobile: no change.
6. Title + author **below** cover stays, but compact (1 line each, ellipsize on overflow). Tooltip on hover for truncated text.
7. Existing `BookCardMenu` 3-dot menu stays in same position (bottom-right of card).
8. Grid is responsive: 6 cols on ≥1280px, 5 on 1024px, 4 on 768px, 3 on 540px, 2 on <540px.

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/components/library/UserBookCard.tsx` | Refactor visual: larger cover, overlay progress bar, status badges. Keep props API stable. |
| `apps/web/src/styles/library.css` (or wherever card styles live) | New rules — `.book-card`, `.book-cover`, `.book-progress-overlay`, `.book-status-badge`. |
| `apps/web/src/components/library/BookStatusBadge.tsx` | **New.** Small reusable badge component for Processing/Failed/New. |
| `apps/mobile/src/components/library/UserBookCard.tsx` (or whatever the mobile equivalent path is) | Mirror visual changes. |
| `apps/web/src/locales/en.json` and mobile equivalent | Add `library.badge.processing`, `library.badge.failed`, `library.badge.new`, `library.badge.finished`. |

## Implementation notes

- **Don't redesign list view in this slice.** List view keeps its current row layout. Only grid is touched. List view gets attention in slice 07 (sorting).
- **Progress bar overlay:** absolutely-positioned `<div>` at bottom of cover with `width: ${progress}%`. Use `linear-gradient` for a subtle shine effect. Animate width changes with `transition: width 0.3s`.
- **"New" pill calculation:** `Date.now() - createdAt < 86400000` (24h). Compute in render — cheap.
- **Status pill colors:** Processing = amber, Failed = red, Finished checkmark = green. Use existing CSS variables from `theme.css` — DO NOT hardcode hex.
- **Failed pill is tappable** but not the whole card — only the pill triggers retry to avoid accidental retry on tap-to-open.
- **Image lazy loading:** add `loading="lazy"` on cover `<img>`. Already may be present, verify.
- **Fallback cover:** if `coverPath` is null/missing, render a generated cover (gradient + first letter of title). New small component `<GeneratedCover title author />` — useful for FB2 books without covers.

## Out of scope

- Sort/filter UI — slice 07/08.
- Per-book menu redesign — slice 10.
- Cover replacement / editing — slice 11 (editable metadata).

## Tests

**Visual regression (Playwright screenshot tests):**
- Grid with 12 books in mixed states (5 ready, 2 processing, 1 failed, 2 new, 1 finished, 1 in-progress) — snapshot.
- List view unchanged — snapshot to confirm no regression.

**Unit:**
- `UserBookCard.test.tsx`: renders correct badge per status. Progress bar width matches percent.
- `BookStatusBadge.test.tsx`: renders three states, "Processing" shows spinner.
- `GeneratedCover.test.tsx`: renders without coverPath, picks consistent gradient based on title hash.

## Done criterion

```bash
pnpm -C apps/web test --filter "UserBookCard|BookStatusBadge|GeneratedCover"
pnpm -C apps/web test:e2e --grep "library-grid"
pnpm -C apps/web build
cd apps/mobile && npx tsc --noEmit

# Manual
# - Account with mixed-state books → grid renders correctly across all 5 breakpoints
# - Processing book → pulse animation visible
# - Failed book → tap pill → retry triggered, success → pill disappears
# - Book without cover → generated cover appears, consistent on re-render
```

## Rollback plan

Revert PR. No data shape changes, no flag, but the changes are isolated to card component + CSS.

## Follow-ups

- "Long-press for quick actions" on mobile — Phase 3 (bulk select) covers selection mode.
- Configurable cover size in user prefs (Compact / Comfortable / Spacious) — Phase 4.
