# Bug Report — PR #55: word bubble + vocab save + "Saved ✓" badge

Scope: commits on `fix/reader-selection-bubble-focus-underline`
  - `14dd139` — 1-word bubble + no-underline focus
  - `3b21a5d` — vocab auto-save on bubble open
  - `04c1ee0` — "Saved ✓" badge overlay

---

## 1. Verification status

| Check | Result |
|---|---|
| `pnpm -C apps/web exec tsc --noEmit` | ✅ clean |
| `pnpm -C apps/web test` (vitest) | ✅ 73/73 pass (incl. 5 new `TranslationBubble` tests) |
| `pnpm -C apps/web build` | ✅ clean (197 KB CSS / 1 MB JS gzipped ~329 KB) |
| Browser smoke (standalone chromium via `/tmp/bubble-smoke.mjs`) | ✅ CSS rules `.translation-bubble__saved` + `--visible` present in bundle |
| Full reader flow (long-press → bubble → save) in browser | ⚠️ **not verified** — requires backend (`docker compose up`) which is not running locally |
| E2E (`pnpm test:e2e`) | ⚠️ not run — requires backend + test fixtures |
| Safari iOS real device | ⚠️ not verified — human device needed |

Built artefact confirmed via Playwright script:
- `.translation-bubble__saved { position: absolute; top: 2px; right: 6px; opacity: 0; transition: opacity 160ms; … }`
- `.translation-bubble__saved--visible { opacity: 1; }`

CSS shipped to `dist/assets/index-CpBbztv0.css`.

---

## 2. Known bugs / edge cases (implementation-level)

### B1. Race: quick word switch while save in flight
**Where:** `apps/web/src/components/reader/ReaderHighlights.tsx:152-168`
**Symptom:** User selects word A → selects word B before A's `addWord` + `translateApi` resolve.
- `translateApi` is aborted via `AbortController` — fine.
- But the `Promise.all` `.then()` still runs the `savedTimerRef` write-back: `setBubble({ word: A, saved: true, … })`.
- The current bubble state is already `{ word: B, … }` → call overwrites B's bubble with A's stale data for ~1s.

**Fix:** Guard the `.then` with an abort check on signal, which we already do via `ctrl.signal.aborted`. But `savePromise` is fire-and-forget and doesn't participate in abort. Mitigation: inside `.then([saved, res])`, also early-return if `selection.text.trim() !== word`.

**Severity:** low (user rarely switches faster than translation latency on touch).

---

### B2. `Saved ✓` badge may visually overlap translation text
**Where:** `apps/web/src/styles/reader.css:244-261`
**Symptom:** Badge sits at `top:2px; right:6px` inside bubble. Long translations (close to 240px `max-width`) will have text running under the "SAVED ✓" letters.

**Fix:** Acceptable per product decision (no layout shift trumps overlap). If noise observed in the wild, add tiny `padding-right: 40px` only when `saved===true` — but that re-introduces layout shift.

**Severity:** cosmetic.

---

### B3. Badge not shown when save completes after 1s auto-close
**Where:** `apps/web/src/components/reader/TranslationBubble.tsx:34-38`
**Symptom:** Bubble auto-fades at `holdMs=2800` + 200ms fade = 3000ms. If `addWord` takes >2000ms (slow network), the "Saved ✓" set-timer (1000ms after resolve) ends up firing after bubble is already closed — but since `closeBubble` calls `clearSavedTimer`, this is safe: no ghost badge. However, the user **never sees** the Saved ✓ confirmation.

**Fix:** Either extend `holdMs` when save is still pending, or accept as graceful degradation. Current behavior: vocab was saved successfully, user just doesn't see the confirmation.

**Severity:** low. Saved data is still correct.

---

### B4. Error translation + successful save → no badge
**Where:** `apps/web/src/components/reader/ReaderHighlights.tsx:171-175`
**Symptom:** If `translateApi` rejects (non-abort), `.catch` sets `{ state: 'error', saved: false }`, even if `savePromise` resolved successfully. User sees `—` in bubble but save DID happen silently.

**Fix:** `.catch` should preserve `saved` from the resolved save. Requires refactor to await `savePromise` separately from `translateApi`, then union the state:
```ts
const saved = await savePromise
try { const res = await translateApi(...); /* show ready + saved */ }
catch { /* show error but still saved=!!saved */ }
```

**Severity:** low-to-medium (users lose feedback but data is saved).

---

### B5. `selection.range` capture timing
**Where:** `apps/web/src/components/reader/ReaderHighlights.tsx:136-138`
**Symptom:** `extractSentence(selection.range, container)` runs synchronously inside useEffect, so `range` is live at capture time — OK. But if React hasn't flushed a new selection yet (very fast consecutive `selectionchange` events), the `range` may be stale. Tested indirectly by the textAnchor tests; not a regression here, just a note.

**Severity:** very low.

---

### B6. Guest: badge shows even when `addGuestWord` returns `false` for a different reason
**Where:** `apps/web/src/hooks/useReaderVocabulary.ts:102-118` + `ReaderHighlights.tsx:154`
**Symptom:** `addWord` returns non-null for a guest only when `addGuestWord` returns `ok`. `didSave = shouldSave && saved != null` correctly accounts for limit-hit case (returns `null`). Confirmed safe.

**Severity:** no bug — noted as positive invariant to guard in future refactors.

---

### B7. CSS specificity: `.translation-bubble` color inherits into badge
**Where:** `apps/web/src/styles/reader.css:219-238`
**Symptom:** `.translation-bubble` sets `color: #fff`. Badge sets `color: rgba(255,255,255,0.7)`. Badge wins via longer selector but not by specificity (both single-class). Confirmed working in smoke (CSS parsed + rule present). If a theme ever overrides `.translation-bubble` with a more specific rule, badge could get bright white. Noted.

**Severity:** future-proofing only.

---

## 3. Not-yet-tested paths (need human device)

- iOS Safari long-press → native `selectionchange` → bubble render → bubble persists 3s → badge visible for 1s → bubble fades. Mobile-specific: `-webkit-touch-callout: none` applied on `.reader-content` (from prior commit).
- Desktop: double-click selects word → same path should work.
- Guest word-limit hit (6+ saves as guest) → `onWordLimitHit` → SoftPaywall paywall opens.

---

## 4. Manual test recipe (for human tester)

```bash
# 1. Start full stack
make up
# 2. Open reader at http://localhost:5173/en/books/{slug}/read/{chapter}
# 3. Sign in (auth flow)
# 4. Long-press a word → bubble shows "…" → translation appears
# 5. Look top-right of bubble: "SAVED ✓" visible for ~1s, then fades
# 6. Open /en/vocabulary in new tab → word is there
# 7. Long-press the SAME word → bubble shows translation, NO "SAVED ✓" badge (dedup)
# 8. Long-press+drag across 2+ words → highlights toolbar appears (not bubble)
```

Expected `Network` tab:
- First long-press: `POST /me/vocabulary/words`, `POST /translate`, `PATCH /me/vocabulary/words/{id}` (translation backfill)
- Second long-press of same word: `POST /translate` only — no vocab API hit.

---

## 5. Blockers that prevented full in-browser test this session

- MCP browser backends (`claude-in-chrome`, `playwright`) both returned "Target page, context or browser has been closed" — extension not connected.
- Docker backend not running → reader page loads shell but can't fetch chapter HTML → can't exercise selection flow.

Verified at layers that don't need backend: unit tests, build artefact, CSS bundle presence.

---

## 6. Recommended next steps

1. Run `make up` + manually walk recipe in §4 on desktop Chrome.
2. Test on iOS Safari (real device) for long-press behavior.
3. If B1/B4 observed in the wild → guard in `.then` with word-match + `.catch` with saved-fallback.
4. Consider adding an E2E spec in `apps/web/e2e/tests/reader-vocab.spec.ts` covering §4 recipe, once backend fixtures are reliable.
