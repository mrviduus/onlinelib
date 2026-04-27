# Slice 18 — Cmd+K command palette

**Phase:** 4 (AI + polish) · **Estimated:** 1.5 days · **Risk:** low · **Flag:** `myBooksV2.commandPalette`

## Goal

Power-user navigation overlay — `Cmd+K` opens a search-driven palette to jump anywhere or do anything in one keystroke. Standard pattern in dev tools (Linear, Raycast, GitHub). TextStack's audience is devs/students/curious — they will love this.

## Acceptance criteria

1. `Cmd+K` (Mac) / `Ctrl+K` (Win/Linux) opens a centered modal overlay with a search input and result list.
2. Result categories (in order):
   - **Books** — fuzzy match against user's library (title, author).
   - **Actions** — Upload book, Edit profile, Toggle theme, Sign out, Open vocab, Open highlights, Open stats.
   - **Pages** — Library, Discover, Vocabulary, Highlights, Practice, Stats, Settings.
   - **Recent** — last 5 visited routes (when input is empty).
3. Arrow keys navigate, Enter selects, Esc closes.
4. Selecting a book navigates to reader at last position.
5. Selecting an action invokes the corresponding handler.
6. Mouse / tap also works.
7. Web only this slice (mobile has tabs, not analogous on phones).
8. Behind feature flag `myBooksV2.commandPalette`.

## Files to touch

| File | Change |
|---|---|
| `apps/web/src/components/CommandPalette.tsx` | **New.** Modal + input + result list. |
| `apps/web/src/components/CommandPaletteProvider.tsx` | **New.** Context provider — register actions globally. |
| `apps/web/src/hooks/useCommandPaletteShortcut.ts` | **New.** Global Cmd+K listener. |
| `apps/web/src/lib/commands/index.ts` | **New.** Action registry — pages, common actions. |
| `apps/web/src/App.tsx` | Wrap tree with `<CommandPaletteProvider>`. |
| `apps/web/src/locales/en.json` | All command labels and category headers. |

## Implementation notes

- **Library:** use [`cmdk`](https://github.com/pacocoursey/cmdk) — small, well-designed React command palette primitive (1.3k stars, MIT). Saves ~3 days of work.
  ```bash
  pnpm -C apps/web add cmdk
  ```
- **Fuzzy match:** use `fuzzysort` or `cmdk`'s built-in score. Books matched by `title + author` concatenated.
- **Recent routes:** track last 5 in `localStorage` via a `useTrackVisitedRoute` hook in `App.tsx` reading `useLocation()`.
- **Books are paginated/lazy:** fetch top-50 on palette open if not cached. Don't preload entire library on every page render.
- **Cmd+K must NOT** trigger inside reader iframe / when modal already open / when text input is focused with current selection — be polite.
- **Theme:** matches site theme automatically via CSS vars. Dark by default.

## Out of scope

- Mobile (no analogous interaction; mobile already has bottom tabs from slice 03).
- Voice commands.
- LLM-powered "ask anything" — separate epic.

## Tests

**Unit:**
- `commands/index.test.ts`: action registry correctly resolves; pages list correct.
- `CommandPalette.test.tsx`: open via Cmd+K, type filters, arrow nav, Esc closes.

**E2E:**
- Cmd+K → type "vocab" → enter → land on vocab page.
- Cmd+K → type book title → enter → land in reader at last position.
- Cmd+K → empty → arrow down → recent routes visible → enter → navigates.

## Done criterion

```bash
pnpm -C apps/web test --filter "CommandPalette|commands"
pnpm -C apps/web test:e2e --grep "cmd-k"
pnpm -C apps/web build

# Manual: smoke test Cmd+K on every page; ensure shortcut doesn't break form inputs
```

## Rollback plan

Toggle `myBooksV2.commandPalette` to `false`. Provider becomes no-op, listener disabled. cmdk dependency stays in `package.json`.

## Follow-ups

- Add admin commands when user is admin (`Goto admin panel`, `Reindex search`).
- Add MCP-style integrations (Spotlight for books).
- Per-book commands once selected ("Edit metadata", "Mark finished") — nested palette.
