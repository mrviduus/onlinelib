# My Books v2 — UX roadmap

Four-phase rebuild of the user-owned books experience: from "upload buried 4 clicks deep" to "Kindle-like library with tags, collections, and AI assistance."

**Branch:** `ux/my-books-v2` (cut from `main` AFTER `reader/overlay-v2-foundations` merges to avoid context churn).

**Total scope:** 20 slices across 4 phases, ~4 weeks of focused work for one engineer with Claude Code.

---

## Why now

User journey today is broken. Per current production:

1. Core value prop is upload-your-own-book + AI reading aids.
2. Upload action lives 4 clicks deep behind the avatar dropdown → My Library → Uploads tab → "+" button.
3. Library has only Saved/Uploads tabs, no proper filtering, sorting (limited), no collections, no tags, no per-book stats surface.

This roadmap fixes the entire user-owned-books flow as one cohesive initiative — upload and library are two halves of the same feature, treating them separately would create thrash.

---

## Phases at a glance

| Phase | Theme | Slices | Time | Primary outcome |
|-------|-------|--------|------|-----------------|
| **1** | Upload UX fix | 4 | ~5 days | Time-to-first-upload drops from minutes to <30s |
| **2** | Library MVP | 6 | ~7 days | Library becomes Kindle-like — usable at 50+ books |
| **3** | Power features | 6 | ~7 days | Beats Kindle for dev/student audience (tags, FTS, edit metadata) |
| **4** | AI + polish | 4 | ~5 days | Wow moments — auto-tags, command palette, stats |

**Total: 20 slices, ~24 working days.** Realistic calendar: 5–6 weeks accounting for review cycles and ramp-down.

---

## Sequencing rules

1. **Phase 1 ships completely before Phase 2 starts.** Phase 1 unblocks measurable signal — without an easy upload path, Phase 2 work has no audience.
2. **Each phase = one PR per slice.** No mega-PRs. If a slice exceeds ~400 LOC of diff, split it.
3. **Each slice is reversible.** Either feature-flag-gated or a clean revert in one commit. Never break the existing Library page during a slice.
4. **Mobile and web ship in lockstep where possible.** If a slice changes data shape (e.g. `tags` field), web and mobile both consume it in the same release.
5. **Feature flags:** Phase 3 + 4 features flagged by default. Phase 1 + 2 ship behind a single `myBooksV2` flag, removed after stable rollout.

---

## Definition-of-done conventions (apply to every slice)

A slice is **complete** only when ALL of these are true:

1. **Acceptance criteria** in the brief are met (each brief has a numbered list).
2. **Tests:** unit tests for new logic, E2E updated where user flow changes. `pnpm -C apps/web test` and `dotnet test` green. Mobile: `npx tsc --noEmit` green.
3. **Build:** `pnpm -C apps/web build` and `pnpm -C apps/admin build` green. Mobile: `npx expo prebuild --no-install` green if native config touched.
4. **No console errors / warnings introduced** on a smoke test of the modified page (web devtools + Expo dev menu).
5. **Legacy markers:** any code superseded but not yet removed gets `// TODO(my-books-v2 cleanup): remove` so the cleanup slice knows what to delete.
6. **PR description includes:** what shipped, screenshots/screencast, rollback plan (one-liner), affected metrics.
7. **README of this folder updated** if scope changes (slice added/removed).

---

## Success metrics

Tracked before Phase 1 starts (baseline) and after each phase:

| Metric | Baseline target | Phase 1 target | Phase 2 target |
|--------|-----------------|----------------|----------------|
| Time to first upload (new user, web) | ~120s | <30s | <30s |
| % new users with ≥1 upload in first session | TBD | +50% rel | +50% rel |
| % new users with ≥3 uploads in week 1 | TBD | — | +100% rel |
| Library DAU / Total DAU | TBD | — | >50% |
| Books opened per Library visit | TBD | — | ≥1.0 |
| Upload-to-read conversion (uploaded → opened) | TBD | — | >70% |

Add `apps/web/src/lib/telemetry/myBooksV2.ts` in slice 01 to record the first three.

---

## Slice index

### Phase 1 — Upload UX fix

| # | Slice | Touches |
|---|-------|---------|
| 01 | [Persistent upload button in header](./01-header-upload-button.md) | `Header.tsx`, `UploadModal.tsx` (new) |
| 02 | [Drag-and-drop anywhere on web](./02-drag-drop-anywhere.md) | `App.tsx`, `GlobalDropZone.tsx` (new) |
| 03 | [Mobile bottom-tabs prominent upload](./03-mobile-bottom-tabs.md) | `apps/mobile/app/(tabs)/_layout.tsx` |
| 04 | [Library empty state = drop-zone](./04-empty-state-dropzone.md) | `LibraryPage.tsx`, `EmptyState.tsx` |

### Phase 2 — Library MVP

| # | Slice | Touches |
|---|-------|---------|
| 05 | [Continue Reading shelf at top of Library](./05-continue-reading-shelf.md) | `LibraryPage.tsx` web + mobile |
| 06 | [Cover grid with progress + status badges](./06-cover-grid-progress.md) | `UserBookCard.tsx`, `library.css` |
| 07 | [Sort options (recent / title / author / progress / date added)](./07-sort-options.md) | `LibraryPage.tsx`, `LibrarySortMenu.tsx` (new) |
| 08 | [Filter chips (All / Reading / Finished / Not started / Failed)](./08-filter-chips.md) | `LibraryPage.tsx`, `LibraryFilters.tsx` (new) |
| 09 | [In-library search (title + author + content FTS)](./09-library-search.md) | `LibraryPage.tsx`, backend search endpoint |
| 10 | [Per-book action menu unification (Edit / Mark / Re-process / Delete)](./10-per-book-action-menu.md) | `UserBookMenu.tsx`, `BookCardMenu.tsx` |

### Phase 3 — Power features

| # | Slice | Touches |
|---|-------|---------|
| 11 | [Editable metadata modal](./11-editable-metadata.md) | `UserBookEditModal.tsx` (new), backend PUT endpoint |
| 12 | [Tags (jsonb on UserBook, inline editing)](./12-tags.md) | DB migration, `UserBook` entity, `TagInput.tsx` (new) |
| 13 | [Collections (named shelves)](./13-collections.md) | `Collection` entity + migration, `CollectionPicker.tsx` (new) |
| 14 | [Bulk select + bulk actions](./14-bulk-select.md) | `LibraryPage.tsx`, `BulkActionBar.tsx` (new) |
| 15 | [Per-book stats page](./15-per-book-stats-page.md) | `UserBookDetailPage.tsx`, new stats endpoint |
| 16 | [Full-text content search across uploads](./16-fts-content-search.md) | Backend FTS over `UserChapter`, `LibrarySearch` enhancement |

### Phase 4 — AI + polish

| # | Slice | Touches |
|---|-------|---------|
| 17 | [AI auto-tags via Ollama](./17-ai-auto-tags.md) | `BookMetadataGenerator.cs`, tag suggestion UI |
| 18 | [Cmd+K command palette](./18-cmd-k-palette.md) | `CommandPalette.tsx` (new), web only |
| 19 | [Reading time estimate per book](./19-reading-time-estimate.md) | `useReadingPace.ts` hook, badge on cover |
| 20 | [Library stats dashboard (this month / streak / goals)](./20-library-stats-dashboard.md) | `LibraryStatsHeader.tsx` (new) |

---

## When NOT to add a slice

Mid-roadmap scope creep is the #1 risk. **Reject** these even if tempting:

- New format support (MOBI/AZW3) — separate epic, see backend audit notes.
- Reader internal changes — those belong to overlay-v2 line of work.
- Social/sharing features — out of scope; this roadmap is single-user library.
- Public/admin library changes — this roadmap touches user-owned books only.

If you find yourself wanting to add a slice during execution, write it down, ship the current roadmap, then re-prioritize.

---

## How to run a slice (workflow for Claude Code)

```
1. Read this README (orientation).
2. Open the slice file (e.g. docs/ux-roadmap/01-header-upload-button.md).
3. Work through the brief slice top-to-bottom — every section is required.
4. Run all checks listed in the slice's "Done criterion" section.
5. Open PR with title "my-books-v2 [01]: persistent upload button" and the rollback plan in the description.
6. After merge: tick the slice in this README and move to the next.
```

---

## Status tracking

Tick after merge (do not pre-tick).

- [ ] 01 Header upload button
- [ ] 02 Drag-drop anywhere
- [ ] 03 Mobile bottom-tabs upload
- [ ] 04 Library empty-state dropzone
- [ ] 05 Continue Reading shelf
- [ ] 06 Cover grid + progress badges
- [ ] 07 Sort options
- [ ] 08 Filter chips
- [ ] 09 In-library search (titles)
- [ ] 10 Per-book action menu
- [ ] 11 Editable metadata
- [ ] 12 Tags
- [ ] 13 Collections
- [ ] 14 Bulk select
- [ ] 15 Per-book stats page
- [ ] 16 FTS content search
- [ ] 17 AI auto-tags
- [ ] 18 Cmd+K palette
- [ ] 19 Reading time estimate
- [ ] 20 Library stats dashboard
- [ ] 99 Cleanup — remove `myBooksV2` flag + legacy markers
