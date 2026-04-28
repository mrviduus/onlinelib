# Slice 08 — Cleanup: remove `myBooksV3` flags + legacy markers

**Phase:** 3 (Add unification + cleanup) · **Estimated:** 0.5 day · **Risk:** low (if rollout was stable) · **Flag:** none

## Goal

Mirrors v2 slice 99. After all 7 v3 slices have been at 100% rollout for ≥ 2 weeks with no regressions: remove every `myBooksV3.*` feature flag, delete every `// TODO(my-books-v3 cleanup): remove` marker (and the code it points to), drop dead imports and i18n keys.

## Acceptance criteria

1. `grep -rE "myBooksV3\." apps/web/src apps/mobile/src` returns 0.
2. `grep -rE "TODO\(my-books-v3 cleanup\)" apps/web/src apps/mobile/src backend/src` returns 0.
3. Deleted files (driven by markers added in slices 01-07):
   - `apps/web/src/components/library/LibraryFilters.tsx` (replaced by `LibraryStatusTabs` in slice 06)
   - Old route definitions for `/books/*` in `App.tsx` (replaced by `/discover/*` in slice 02 — kept as safety net during rollout, removed here once nginx redirect proven)
   - Any other files marked during slice 01-07 execution.
4. Cleanup of `apps/web/src/lib/features.ts`:
   - Remove all `myBooksV3.*` keys.
   - If file becomes empty (no flags at all) → delete file entirely; otherwise leave for future flags.
5. Telemetry module `apps/web/src/lib/telemetry/myBooksV3.ts` — keep but rename to `apps/web/src/lib/telemetry/navTelemetry.ts` (drop v3 marker; it's just current state).
6. i18n keys removed:
   - `library.tab.saved`, `library.tab.uploads` (replaced by sidebar copy)
   - `library.filter.all`, `library.filter.reading`, etc. (replaced by status tab copy)
   - `nav.about` if removed from header
7. v2 README (`docs/ux-roadmap/README.md`) updated to note "superseded by v3 IA refactor (see `docs/ux-roadmap-v3/`)".
8. Post-mortem section appended to `docs/ux-roadmap-v3/README.md`: "Lessons learned" — what worked, what didn't, what to do differently in v4.

## Files to touch

Determined dynamically by the two grep commands above. Expect ~10-15 files touched, mostly:
- Removing `if (features.myBooksV3.foo) { ... } else { legacy }` conditionals — keep only the new path.
- Deleting commented-out legacy components.
- Updating imports.

## Implementation notes

- **Run both greps as PR start.** Each match is a TODO for this slice.
- **Conditional flag removal pattern:**
  ```ts
  // Before:
  if (features.myBooksV3.statusTabsPrimary) {
    return <LibraryStatusTabs />
  } else {
    return <LibraryFilters />  // legacy
  }
  
  // After:
  return <LibraryStatusTabs />
  ```
- **Import cleanup:** after deletion, run `pnpm -C apps/web lint --fix` then `tsc --noEmit` to verify.
- **No DB migrations** in this slice. Backend additive columns (e.g. shelves data) stay forever.
- **`/books/*` React Router fallback removal** — only safe AFTER 4+ weeks of nginx redirect serving 100% traffic. Verify Search Console shows no `/books/*` impressions before deleting.

## Out of scope

- Reverting backend additive changes (HomeShelves endpoint, etc.) — first-class data, not flags.
- Removing `docs/ux-roadmap-v3/` folder — it's project history, keep it.
- Reverting URL migration `/books/*` → `/discover/*` is NOT cleanup — it's the new state.

## Tests

The whole test suite passes with no regression:

```bash
pnpm -C apps/web test
pnpm -C apps/web test:e2e
pnpm -C apps/admin test  # if exists
pnpm -C apps/web build
pnpm -C apps/admin build
dotnet test
cd apps/mobile && npx tsc --noEmit
cd apps/mobile && npx playwright test
```

## Done criterion

1. Both grep commands return 0.
2. All test suites green.
3. PR description includes screenshot of v3 README's post-mortem section + the metric deltas (baseline vs end-of-v3).
4. Tag git commit: `git tag -a my-books-v3-complete -m "My Books v3 IA refactor complete"`.

## Rollback plan

If a bug is discovered post-cleanup that was masked by a flag — revert the cleanup PR and re-introduce the flag for the affected feature ONLY (not all). The cleanup PR should be small enough to be selectively reverted file-by-file.

## Follow-ups

None — this is the terminal slice of v3.

Future v4 candidates collected from research doc + execution learnings:
- Email-to-Upload backend + UI activation
- URL paste + content fetcher
- AI summary per chapter (Ghostreader-equivalent)
- Persistent right-side detail panel
- Pinned views / saved smart filters
- Notebook tab per book (highlights aggregation view)
- Configurable home shelves
- Calibre/Kindle-export import flow
