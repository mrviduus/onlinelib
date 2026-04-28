# Slice 03 — Library sidebar (source as filter, not tabs)

**Phase:** 2 (Library restructure) · **Estimated:** 2 days · **Risk:** medium · **Flag:** `myBooksV3.librarySidebar`

## Goal

Replace the Saved/Uploads tabs at the top of `/library` with a **left sidebar** containing source filters (`All / My uploads / From catalog / Tags / Collections`). Inspired by Readwise sidebar (research doc).

After this slice, the user thinks of their library as **one collection of books**, with source as just one of several lenses (alongside tags, status, collections).

## Acceptance criteria

1. `/library` page layout becomes 2-column on desktop:
   - **Left sidebar (220px):** sticky, contains:
     - **All books** (count) — default
     - **My uploads** (count)
     - **Bookmarked from catalog** (count) — was "Saved" — renamed per locked-in decision (UI copy only, DB column stays `saved_books`)
     - **Tags** (header)
       - Each user tag (count) — sorted by count desc, top 10
       - "All tags →" link if > 10
     - **Collections** (header)
       - Each user collection (count)
       - "+ New collection" link
   - **Center column:** book grid + status tabs (slice 04) + sort + search.
2. Tabs `Saved | Uploads` at top of library are **removed**.
3. Selected sidebar item highlighted; click switches the grid contents.
4. URL reflects selection: `?source=uploads`, `?source=catalog`, `?tag=fantasy`, `?collection=summer`. Combinable with status (slice 04) and search.
5. Mobile: sidebar collapses into a hamburger drawer (slide from left). Default closed; tap sidebar icon to open.
6. UI copy follows locked-in decision: tab key `library.tab.saved` → `library.tab.bookmarked`; sidebar entry uses `library.sidebar.catalog` with value "Bookmarked from catalog". DB column `saved_books` is NOT renamed.
7. Behind `myBooksV3.librarySidebar`. When OFF, old tabs render.

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/pages/LibraryPage.tsx` | Major restructure. Layout becomes grid: sidebar + center. Remove tabs. |
| `apps/web/src/components/library/LibrarySidebar.tsx` | **New** — renders all sidebar sections. |
| `apps/web/src/hooks/useLibrarySource.ts` | **New** — manages active source state, URL sync. |
| `apps/web/src/styles/library.css` | Layout — `display: grid; grid-template-columns: 220px 1fr;`. |
| `apps/mobile/app/(tabs)/library.tsx` | Mobile equivalent — drawer-based sidebar. |
| `apps/mobile/src/components/library/LibrarySidebarDrawer.tsx` | **New** — slide-in drawer. |
| `apps/web/src/locales/en.json` + mobile | `library.sidebar.all`, `library.sidebar.uploads`, `library.sidebar.catalog` ("Bookmarked from catalog"), `library.sidebar.tags`, `library.sidebar.collections`, `library.sidebar.allTags`, `library.sidebar.newCollection`. Also rename `library.tab.saved` → `library.tab.bookmarked` (still used until tabs removed). |
| `infra/env/...` | `VITE_FEATURE_MYBOOKSV3_LIBRARY_SIDEBAR=true`. |

## Implementation notes

- **Counts** in sidebar items come from same data already loaded (`useLibrary` + `useUserBooks`). No new endpoint needed.
- **URL sync:** use `useSearchParams`. Single source of truth — sidebar reflects URL, click on sidebar updates URL.
- **Combinable params:** `?source=uploads&status=reading&q=tolkien` should all combine. The data flow:
  ```
  Full library → filter by source → filter by status → filter by tag/collection → search → sort
  ```
- **Sidebar tag list:** call existing `useUserTags()` from v2 slice 12. Display top 10 by count, link to "All tags →" page if more.
- **"New collection" link:** opens existing collection-create modal from v2 slice 13.
- **Mobile drawer:** use `react-native-reanimated` for smooth slide. Backdrop for tap-to-close. Auto-close on selection.
- **"Saved" → "Bookmarked" copy migration:** per locked-in decision, every UI surface that says "Saved" becomes "Bookmarked" (sidebar shows "Bookmarked from catalog"; tab key renamed `library.tab.saved` → `library.tab.bookmarked`). DB column `saved_books`, API field names, and analytics events all stay — UI/i18n only.
- **Default selection:** "All books" if no `?source=` in URL.

## Out of scope

- Status tabs (slice 04).
- + button menu (slice 05).
- Tag/collection management UIs (already done in v2 slices 12/13).

## Tests

**Unit:**
- `LibrarySidebar.test.tsx`: renders all sections, counts correct, click updates URL.
- `useLibrarySource.test.ts`: URL roundtrip, combination with other params.

**E2E:**
- Library with mixed uploads + saved → sidebar shows correct counts.
- Click "My uploads" → grid shows only uploads, URL has `?source=uploads`.
- Click tag in sidebar → grid filtered to that tag.
- Mobile: tap sidebar icon → drawer slides in → tap "Uploads" → drawer closes, grid filtered.

## Done criterion

```bash
pnpm -C apps/web test --filter "LibrarySidebar|useLibrarySource"
pnpm -C apps/web test:e2e --grep "library-sidebar"
pnpm -C apps/web build
cd apps/mobile && npx tsc --noEmit
```

## Rollback plan

Toggle `VITE_FEATURE_MYBOOKSV3_LIBRARY_SIDEBAR=false`. Tabs Saved/Uploads return. URL params still work but no sidebar UI.

## Follow-ups

- "All tags" overflow page (when user has > 10 tags).
- Drag book onto sidebar tag/collection → adds (extends v2 slice 13 drag pattern).
- Collapsible sidebar sections (Tags expanded/collapsed by user preference).
