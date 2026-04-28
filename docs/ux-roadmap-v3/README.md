# My Books v3 — Information Architecture refactor

**Branch:** `ux/my-books-v3-ia` · **Cut from:** `main` AFTER my-books-v2 cleanup is stable for 1 week.

**Total scope:** 8 slices, ~4 weeks calendar (one engineer + Claude Code).

**Foundation document:** [`docs/research/library-ia-comparison.md`](../research/library-ia-comparison.md) — Readwise Reader IA research that drives this roadmap. Read it before starting slice 01.

---

## Why v3 (not v2 continuation)

v2 fixed the Library page (added shelves, sort, filters, tags, collections, stats). It did NOT fix the deeper structural problem: **public catalog still occupies primary navigation for logged-in users**, and **logged-in landing is the marketing page**, not their workspace.

Concrete bug:
```
Logged-in user opens textstack.app
  → sees "Finish the book you keep quitting" hero (SEO funnel)
  → must navigate: avatar dropdown → My Library → Uploads tab
  → 4 clicks to their actual content
```

Inspired by Readwise Reader's IA — research doc shows them having two top-level surfaces (Home + Library) for personal content, with discovery tucked behind `+` menu. We adapt their model for our SEO-dependent context.

**v3 outcome:** logged-in user lands in `/home` (smart shelves of their content), with `My Library` (full grid) one click away, and `Discover` (current /books catalog) demoted from primary to secondary nav.

---

## Phases at a glance

| Phase | Theme | Slices | Time | Primary outcome |
|-------|-------|--------|------|-----------------|
| **1** | IA foundation | 4 | ~10 days | Logged-in lands in /home; header reframed; /books → /discover |
| **2** | Library restructure | 2 | ~5 days | Library sidebar replaces tabs; status as primary axis |
| **3** | Add unification + cleanup | 2 | ~5 days | + button is a menu; legacy nav gone |

**Total: 8 slices, ~20 working days.** Realistic calendar: 4-5 weeks.

---

## Sequencing rules

1. **Phase 1 ships sequentially within itself** — slice 01 (header) can ship independently, but slice 03 (state-aware landing) needs slice 04 (smart shelves on /home) to land first or the new landing is empty.
2. **Phase 2 starts only after Phase 1 stable.** Library work depends on header + routes from Phase 1.
3. **Phase 3 starts after Phase 2.** Add menu (slice 07) replaces the upload button shape from v2 slice 01 — needs the new IA in place.
4. **Each slice is feature-flagged.** `myBooksV3.<feature>` flags. Default `false` in prod for first 48h, then on. Slice 99 cleanup removes them.
5. **Each slice ships as ONE PR.** Same convention as v2.
6. **Mobile lockstep:** desktop and mobile change together within the same slice for IA consistency. Mobile bottom-tabs (deferred Slice 03 of v2) gets revisited inside v3 slice 02 (header reframe equivalent for mobile).

---

## Definition-of-done conventions (apply to every slice)

Same as v2, plus one new mandatory item carried over from the v2 lesson:

0. **Production rollout step:** every slice with a feature flag MUST add the flag's `VITE_FEATURE_*` variable to the production env (.env / docker-compose / CI secrets) AS PART OF THE SAME PR. Without this, the slice ships to `main` but stays dark in production. Verify on prod URL after deploy before requesting review.

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
| % logged-in sessions starting on /home (vs /) | 0% | >80% |
| Time-to-personal-content for new login (clicks) | 1 (avatar→Library) | 0 (auto-land) |
| Library DAU / Total DAU | TBD measure now | +15% rel |
| Bounce rate on /home | n/a | <30% |
| Catalog → upload conversion (saved-from-catalog → upload) | TBD | hold flat |
| SEO traffic to /books vs /discover (post-redirect) | 100% /books | >95% transferred to /discover within 4 weeks |

Add `apps/web/src/lib/telemetry/myBooksV3.ts` in slice 01 — tracks landing surface, header click distribution, library entry source.

---

## Slice index

### Phase 1 — IA foundation

| # | Slice | Touches |
|---|-------|---------|
| 01 | [Header reframe — Home/Library/Discover/+](./01-header-reframe.md) | `Header.tsx`, `UserMenu.tsx`, header CSS |
| 02 | [/books → /discover URL migration with 301 redirects](./02-discover-url-migration.md) | Routes, nginx, sitemap, internal links |
| 03 | [/home route + state-aware landing](./03-home-route-state-aware-landing.md) | New page, App.tsx routing, redirect logic for bots |
| 04 | [Smart shelves on /home](./04-home-smart-shelves.md) | `HomePage.tsx`, shelves API, `HomeShelf.tsx` |

### Phase 2 — Library restructure

| # | Slice | Touches |
|---|-------|---------|
| 05 | [Library sidebar — source as filter, not tabs](./05-library-sidebar-source-filter.md) | `LibraryPage.tsx`, sidebar component, deprecate Saved/Uploads tabs |
| 06 | [Status as horizontal tabs (Reading/Finished/Not started)](./06-library-status-tabs-primary.md) | Promote v2 slice 08 filter chips to primary tabs |

### Phase 3 — Add unification + cleanup

| # | Slice | Touches |
|---|-------|---------|
| 07 | [+ button becomes a menu (Upload / future Email / Browser ext)](./07-plus-button-menu.md) | `UploadButton.tsx` → `AddMenu.tsx`, prepare slots |
| 08 | [Cleanup — remove legacy nav, flags, deprecated routes](./08-cleanup.md) | Mirror of v2 slice 99 |

---

## Architectural decisions baked into this roadmap

These come from the research doc — re-reading them here as guardrails:

1. **Public catalog stays accessible** — it's the SEO funnel. We renamed (Books → Discover) and demoted, but did NOT bury. SEO traffic continues to land on `/discover/*`.
2. **Logged-in user has TWO personal surfaces:** `/home` (smart shelves) and `/library` (full grid). Both are about the user's content.
3. **Source becomes a sidebar filter inside Library**, not horizontal tabs. Saved/Uploads disappear as primary axis; replaced with "All / My uploads / From catalog / Tags / Collections" sidebar.
4. **Status (Reading/Finished/Not started) becomes the primary horizontal axis on Library.** Promoted from v2 slice 08 filter chips to first-class tabs at top of grid.
5. **`+` is a menu, not a single action.** Even if today only Upload works, the menu structure prepares future flows (Email-to-Upload, URL-paste, Calibre import) without rewriting nav.
6. **Mobile parity** — every slice that touches navigation also updates mobile equivalent. v2 deferred mobile slice 03 (bottom-tabs upload) — revisited as part of v3 slice 01.

---

## When NOT to add a slice

Same rules as v2. Specifically reject these even if tempting:

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

Use the slash commands in `.claude/commands/` — `/slice 01` reads the brief, `/check` runs gates, `/pr` opens PR + changelog.

---

## Status tracking

Tick after merge (do not pre-tick).

- [ ] 01 Header reframe
- [ ] 02 /books → /discover URL migration
- [ ] 03 /home route + state-aware landing
- [ ] 04 Smart shelves on /home
- [ ] 05 Library sidebar — source as filter
- [ ] 06 Status tabs primary
- [ ] 07 + button → menu
- [ ] 08 Cleanup — remove `myBooksV3` flags + legacy markers

---

## Architectural decisions (locked-in)

These were the v3 open questions; resolved before slice 01 cuts. Treat as guardrails, not as up-for-debate.

1. **Authenticated `/` → `/home` is a CLIENT-SIDE redirect.** React Router `<Navigate replace>` inside the `/` route, gated on `useAuth().isAuthenticated`, with a loading skeleton during the auth-context boot. Bots are never authenticated → they keep landing on the marketing surface, so SSG / SEO is untouched. NOT doing: server-side 302 from nginx or the API. Can be added later as an optimisation if the skeleton flicker becomes a real complaint, but it isn't a launch blocker.

2. **Mobile bottom-tabs ship INSIDE slice 01.** Header reframe = nav reframe everywhere; web and mobile move together so the IA is consistent on day one. NOT doing: a separate "mobile slice" later (that's the v2 deferred-slice-03 trap — once it's split off, it stays split off).

3. **`/home` is a separate route, not a `/library` mode.** Gives room for future personalised content — today's reading, vocab nudge, streak banner — that doesn't belong inside Library's grid model. NOT doing: collapsing `/home` into `/library` "smart mode" — couples two surfaces that need to evolve independently.

4. **UI copy: "Saved" → "Bookmarked" everywhere.** Disambiguates from "saved highlights" / "saved view." Pure i18n change: `library.tab.saved` → `library.tab.bookmarked`, sidebar label becomes "Bookmarked from catalog." NOT doing: any DB rename — `saved_books` column / API stays as-is, UI-only translation.
