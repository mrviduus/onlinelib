# Slice 99 — Cleanup: remove flags + legacy markers

**Phase:** Post-rollout · **Estimated:** 0.5 day · **Risk:** low (if rollout was stable) · **Flag:** none

## Goal

After all 20 slices have been at 100% rollout for ≥ 2 weeks with no regressions: remove every `myBooksV2.*` feature flag, delete every `// TODO(my-books-v2 cleanup): remove` marker (and the code it points to), drop dead imports.

This slice is what makes the roadmap a NET reduction in tech debt instead of an addition.

## Acceptance criteria

1. Grep returns 0 for every `myBooksV2` flag reference:
   ```bash
   grep -rE "myBooksV2\." apps/web/src apps/mobile/src
   # Should return zero matches
   ```
2. Grep returns 0 for every cleanup marker:
   ```bash
   grep -rE "TODO\(my-books-v2 cleanup\)" apps/web/src apps/mobile/src backend/src
   # Should return zero matches
   ```
3. Deleted files (and any imports referencing them):
   - `apps/web/src/components/library/BookCardMenu.tsx` (replaced by `BookActionMenu` in slice 10)
   - `apps/web/src/components/library/UserBookMenu.tsx` (replaced by `BookActionMenu` in slice 10)
   - Any other files marked during slice 01–20 execution.
4. `apps/web/src/lib/features.ts` cleaned — no `myBooksV2.*` keys remain.
5. `apps/web/src/lib/telemetry/myBooksV2.ts` retained but renamed to `apps/web/src/lib/telemetry/myBooksTelemetry.ts` (drop the v2 marker — it's just current state now).
6. README of `docs/ux-roadmap/` updated: every checkbox ticked, post-mortem section added with "what we'd do differently."

## Files to touch

Determined dynamically — driven by the two grep commands above. Expect ~10–20 files touched, mostly:
- Removing `if (flagOn) { ... } else { legacy }` conditionals — keep only the new path.
- Deleting commented-out legacy components.
- Updating imports in pages that referenced both old and new menu components.

## Implementation notes

- **Run both greps as PR start point.** Each match is a TODO for this slice.
- **Conditional flag removal pattern:**
  ```ts
  // Before:
  if (features.myBooksV2.tags) {
    return <TagInput />
  } else {
    return null
  }
  
  // After:
  return <TagInput />
  ```
- **Import cleanup:** after deletion, run `pnpm -C apps/web lint --fix` to catch unused imports. Then `tsc --noEmit` to verify nothing broken.
- **Migration:** no DB migrations in this slice. Backend additive columns stay forever.
- **Telemetry events keep firing** — they're now the new normal. Don't delete the telemetry module.

## Out of scope

- Reverting backend additive columns (Tags, Collections, IsFinished, MetadataHistory, etc.) — these are first-class data, not flags.
- Removing the `docs/ux-roadmap/` folder — it's project history, keep it.

## Tests

**The whole test suite should pass with no regression:**

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
3. PR description includes a screenshot of the README's post-mortem section + the metric deltas (before-Phase-1 vs end-of-Phase-4).
4. Tag git commit: `git tag -a my-books-v2-complete -m "My Books v2 rollout complete"`.

## Rollback plan

If a bug is discovered post-cleanup that was masked by a flag — revert the cleanup PR and re-introduce the flag for the affected feature ONLY (not all). The cleanup PR should be small enough to be selectively reverted file-by-file.

## Follow-ups

None — this is the terminal slice.
