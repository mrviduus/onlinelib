# My Books v3 — Information Architecture refactor

**Branch:** `ux/my-books-v3-ia` · **Cut from:** `main` AFTER my-books-v2 cleanup is stable for 1 week.

**Total scope:** 6 slices + 1 cleanup, ~3 weeks calendar (one engineer + Claude Code).

**Foundation document:** [`docs/research/library-ia-comparison.md`](../research/library-ia-comparison.md) — Readwise Reader IA research that drives this roadmap. Read it before starting slice 01.

---

## Why v3 (not v2 continuation)

v2 fixed the Library page (added shelves, sort, filters, tags, collections, stats). It did NOT fix the deeper structural problem: **public catalog still occupies primary navigation for logged-in users**, and **logged-in users have to dig through avatar dropdown to reach their workspace**.

Concrete bug:
```
Logged-in user opens textstack.app
  → sees marketing hero
  → must navigate: avatar dropdown → My Library → Uploads tab
  → 4 clicks to their actual content
```

Inspired by Readwise Reader's IA — research doc shows them having a personal landing surface with shelves of the user's content, with discovery tucked behind `+` menu. We adapt their model for our SEO-dependent context.

**v3 outcome:** logged-in user clicks the logo → lands on `/library`, which now opens with **smart shelves of their content** at the top and the existing grid below. The public catalog (`Books`) is reframed as a sibling of `Library`, accessible but no longer the only first-class destination. URL `/books/*` does not change — SEO is untouched.

---

## Phases at a glance

| Phase | Theme | Slices | Time | Primary outcome |
|-------|-------|--------|------|-----------------|
| **1** | Library landing | 2 | ~4 days | Header reframed (Library primary, Books sibling); smart shelves at top of `/library` |
| **2** | Library restructure | 2 | ~3 days | Library sidebar replaces tabs; status as primary axis |
| **3** | Add unification + cleanup | 2 | ~2 days | + button is a menu; legacy nav gone |

**Total: 6 slices + 1 cleanup, ~9 working days.** Realistic calendar: 3 weeks with PR review + rollout buffers.

---

## Sequencing rules

1. **Phase 1 ships sequentially within itself** — slice 01 (header reframe) ships first; slice 02 (smart shelves on `/library`) lands on top of the already-reframed surface.
2. **Phase 2 starts only after Phase 1 stable** — sidebar + status tabs assume the Library landing already exists.
3. **Phase 3 starts after Phase 2** — `+` menu replaces the upload button shape from v2 slice 01; cleanup is the terminal slice.
4. **Each slice is feature-flagged.** `myBooksV3.<feature>` flags. Default `false` in prod for first 48h, then on. Slice 06 cleanup removes them.
5. **Bundle slices into one PR per slice.** Same convention as v2.
6. **Mobile lockstep:** desktop and mobile change together within the same slice for IA consistency. Mobile bottom-tabs (deferred slice 03 of v2) gets revisited inside v3 slice 01.

---

## Definition-of-done conventions (apply to every slice)

Same as v2, plus the rollout step carried over from v2 lessons:

0. **Production rollout step:** every slice with a feature flag MUST add the flag's `VITE_FEATURE_*` variable to the production env (`.github/workflows/deploy.yml` / docker-compose / CI secrets) AS PART OF THE SAME PR. Without this, the slice ships to `main` but stays dark in production. Verify on prod URL after deploy before requesting review.

1. **Acceptance criteria** in the brief are met.
2. **Tests:** unit + E2E updated. `pnpm -C apps/web test`, `dotnet test`, `npx tsc --noEmit` (mobile) — all green.
3. **Build:** `pnpm -C apps/web build`, `pnpm -C apps/admin build` green.
4. **No console errors on smoke test** of modified pages.
5. **Legacy markers** `// TODO(my-books-v3 cleanup): remove` on superseded code.
6. **PR description** includes: what shipped, screenshots, rollback plan, affected metrics.
7. **README of this folder updated** if scope changes.

---

## Success metrics

Tracked before Phase 1 starts (baseline post-v2) and after each phase:

| Metric | Baseline (post-v2) | v3 target |
|--------|--------------------|-----------|
| Time-to-personal-content for logged-in landing | 1+ click via avatar dropdown | 0 (logo → `/library`) |
| Library DAU / Total logged-in DAU | TBD measure now | +15% rel |
| Shelves engagement on `/library` (clicks on shelf items / sessions) | n/a | >40% of Library sessions click ≥ 1 shelf item |
| "Continue reading" → reader open rate | TBD via heatmap | >25% of Library sessions |
| Catalog → upload conversion (saved-from-catalog → upload) | TBD | hold flat |
| Public catalog SEO traffic to `/books` | 100% | hold flat (URL unchanged) |

Add `apps/web/src/lib/telemetry/myBooksV3.ts` in slice 01 — tracks header click distribution, library entry source, shelf item clicks.

---

## Slice index

### Phase 1 — Library landing

| # | Slice | Touches |
|---|-------|---------|
| 01 | [Header reframe — Library / Books / Vocabulary / + ▾](./01-header-reframe.md) | `Header.tsx`, `UserMenu.tsx`, header CSS, mobile bottom-tabs |
| 02 | [Smart shelves at top of Library](./02-library-smart-shelves.md) | `LibraryPage.tsx`, shelves API, `LibraryShelf.tsx` |

### Phase 2 — Library restructure

| # | Slice | Touches |
|---|-------|---------|
| 03 | [Library sidebar — source as filter, not tabs](./03-library-sidebar-source-filter.md) | `LibraryPage.tsx`, sidebar component, deprecate Saved/Uploads tabs |
| 04 | [Status as horizontal tabs (Reading/Finished/Not started)](./04-library-status-tabs-primary.md) | Promote v2 slice 08 filter chips to primary tabs |

### Phase 3 — Add unification + cleanup

| # | Slice | Touches |
|---|-------|---------|
| 05 | [+ button becomes a menu (Upload / future Email / Browser ext)](./05-plus-button-menu.md) | `UploadButton.tsx` → `AddMenu.tsx`, prepare slots |
| 06 | [Cleanup — remove `myBooksV3` flags + legacy markers](./06-cleanup.md) | Mirror of v2 slice 99 |

---

## Architectural decisions baked into this roadmap

These come from the research doc + the simplification pass — re-reading them here as guardrails:

1. **Public catalog stays at `/books/*` with the label "Books".** No URL migration, no rename. SEO is untouched. The only change is that "Books" is now a sibling of "Library" in the header, not the primary destination.
2. **No `/home` route.** The user's logo click → `/library`. Adding a separate `/home` surface would split personalisation across two pages with no clear home/library boundary; instead we stack shelves at the top of `/library` and keep the grid below.
3. **Source becomes a sidebar filter inside Library**, not horizontal tabs. Saved/Uploads disappear as primary axis; replaced with "All / My uploads / Bookmarked from catalog / Tags / Collections" sidebar.
4. **Status (Reading/Finished/Not started) becomes the primary horizontal axis on Library.** Promoted from v2 slice 08 filter chips to first-class tabs at top of grid.
5. **`+` is a menu, not a single action.** Even if today only Upload works, the menu structure prepares future flows (Email-to-Upload, URL-paste, Calibre import) without rewriting nav.
6. **Mobile parity** — every slice that touches navigation also updates mobile equivalent. v2 deferred mobile slice 03 (bottom-tabs upload) — revisited as part of v3 slice 01.

---

## When NOT to add a slice

Same rules as v2. Specifically reject these even if tempting:

- **`/books/*` URL migration / rename** (e.g. to `/discover/*`) — high SEO blast radius, low UX value. Locked OUT of v3 in the simplification pass; revisit only if a separate SEO + product case justifies it.
- **Separate `/home` route** — collapsed into `/library` shelves on purpose. Don't reintroduce a second personal surface mid-flight.
- **Persistent right-side detail panel** (Readwise pattern) — bigger UX shift, separate epic. Keep v2 slice 15 stats page approach for now.
- **Email-to-Upload** — backend infra (incoming-mail handler, parsing) is its own epic.
- **AI summary per chapter** — out of scope; we have BookMetadataGenerator already.
- **Reader internal changes** — those belong to overlay-v2 line of work.
- **Tags/Collections enhancements** — they're done in v2; v3 doesn't touch.

If something tempts during execution: write it down for "v4 ideas", ship the v3 roadmap, then re-prioritize.

---

## How to run a slice

```
1. Read this README + research/library-ia-comparison.md (orientation).
2. Open the slice file (e.g. docs/ux-roadmap-v3/01-header-reframe.md).
3. Work through brief top-to-bottom.
4. Run /check.
5. Run /pr — auto-appends to CHANGELOG.md.
6. After merge: tick the slice in this README and move to the next.
```

Use the slash commands in `.claude/commands/` — `/check` runs gates, `/pr` opens PR + changelog. (`/slice` was removed on 2026-08-20; point Claude at the brief file directly instead.)

---

## Status tracking

Tick after merge (do not pre-tick).

- [x] 01 Header reframe
- [ ] 02 Smart shelves at top of Library
- [x] 03 Library sidebar — source as filter
- [x] 04 Status tabs primary
- [x] 05 + button → menu
- [x] 06 Cleanup — remove `myBooksV3` flags + legacy markers

---

## Post-mortem (slice 06 closeout — 2026-04-28)

All 6 slices landed. v3 is the only path; flags removed, legacy components deleted.

What went well:
- Each slice flag-gated and bundled into one PR per slice (no CI spam).
- Mobile + web moved together per slice 01 decision — no IA drift between platforms.
- Telemetry module renamed `myBooksV3.ts` → `navTelemetry.ts` (drop v3 marker; it's just current state).
- e2e race in slice 04 (default `status='reading'` filter vs progressMap fetch) caught and fixed before merge.

Deleted in slice 06:
- `apps/web/src/components/library/LibraryFilters.tsx`, `ContinueReadingShelf.tsx`, `useContinueReadingList.ts` (+ tests)
- Mobile equivalents
- All `VITE_FEATURE_MYBOOKSV3_*` env wiring in `.github/workflows/deploy.yml`
- Legacy i18n keys: `library.tab.bookmarked`, `library.continueShelf.title`, `library.continueShelf.badge`

---

## Architectural decisions (locked-in)

These were the v3 open questions; resolved before slice 01 cut and reaffirmed in the simplification pass. Treat as guardrails, not as up-for-debate.

1. **Logo click is the personal-landing entry point.** Authenticated → logo `to="/library"`; unauthenticated → logo `to="/"` (marketing). Implemented inside the brand link via `useAuth()`. NOT doing: a separate `/home` route, nor a server-side redirect — the route stays `/library` and shelves render at the top of it.

2. **Mobile bottom-tabs ship INSIDE slice 01.** Header reframe = nav reframe everywhere; web and mobile move together so the IA is consistent on day one. NOT doing: a separate "mobile slice" later (that's the v2 deferred-slice-03 trap — once it's split off, it stays split off).

3. **`/books/*` URL stays.** No 301 migration, no rename to `/discover`. SEO funnel is untouched. The header label stays "Books"; only its position in the nav changes (sibling of Library, not the primary destination).

4. **UI copy: "Saved" → "Bookmarked" everywhere.** Disambiguates from "saved highlights" / "saved view." Pure i18n change: `library.tab.saved` → `library.tab.bookmarked`, sidebar label becomes "Bookmarked from catalog." NOT doing: any DB rename — `saved_books` column / API stays as-is, UI-only translation.
