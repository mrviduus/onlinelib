# UX Redesign — Mobile (Slices 1-5)

**Goal:** Transform from "reader with translation" → "learning system through reading"
**Priority:** Mobile (Play Store release)
**Branch:** `ux-redesign-slice-1-5` (merged to main)
**Commit:** `1d9d3a7`

## Slice 1 — Reader Onboarding

3-step overlay on first reader open. Teaches: tap word → translation → save to vocab.

**File:** `apps/mobile/src/components/OnboardingOverlay.tsx`

- Step 1: "Learn by reading" + animated tap icon
- Step 2: Mock word card (amorphous → аморфний) + Save button
- Step 3: "You're ready!" + checkmark
- Persisted via `AsyncStorage` key `onboarding_reader_done`
- Shown once per device, skippable

**Integration:** `apps/mobile/app/reader/[bookSlug]/[chapterSlug].tsx` checks flag on mount.

## Slice 2 — WordCard (Progressive Disclosure)

Replaces flat `SelectionActionBar` for single-word selections.

**File:** `apps/mobile/src/components/WordCard.tsx`

**Level 1 (default):** Compact card
- Word + auto-translation (via LibreTranslate API)
- TTS button
- Save button (green, prominent)

**Level 2 (tap to expand):**
- Highlight color buttons (yellow, green, pink, blue)
- Dictionary button → opens existing `DictionarySheet`
- Dismiss button

**Level 3:** Existing `DictionarySheet` (unchanged)

Multi-word selections still use `SelectionActionBar`.

**autoLookup change:** No longer auto-saves words or opens DictionarySheet. WordCard shows instead — user explicitly taps Save.

## Slice 3 — Tap & Save Animations

**CSS tap-pulse** (`apps/mobile/src/lib/readerHtml.ts`):
- `@keyframes tap-pulse` — warm highlight flash on single-word selection
- `applyTapPulse()` JS function wraps selection in temp `<span>`, removes after 650ms

**Save animation** (WordCard):
- Scale bounce (1 → 1.2 → 1) on save button via `Animated.spring`
- "Saved!" / "X words saved this session" text fades out over 1.3s

## Slice 4 — Progress Feedback

**Session word counter** in reader:
- `sessionWordCount` state, increments on each save
- Green badge in top bar: school icon + count
- Exit summary overlay: "X words saved" shown for 1.8s before navigating back

**Home screen:**
- `wordsReviewedToday` stat from vocabulary API in quick stats bar

## Slice 5 — Continue Reading & Start CTA

**File:** `apps/mobile/src/components/ContinueReadingCard.tsx`

Authenticated users with reading progress:
- Shows last-read unfinished book (cover, title, progress bar, play button)
- Data: `libraryApi.getLibrary()` + `readingProgressApi.getAllProgress()`
- Finds most recent book with `percent < 1`

Unauthenticated users:
- "Start Reading" CTA button → navigates to book catalog

**Home layout (authenticated):** Hero → ContinueReadingCard → Stats Bar → Quick Stats → Vocab Review → Recent Books → Authors

## Bug Fix — Translation API

**Problem:** `packages/shared/src/api/translation.ts` sent `{ q, source, target }` but backend expects `{ text, sourceLang, targetLang }`.

**Fix:**
- Shared client: field names corrected
- Backend: added `/translate` compat route (nginx strips `/api/` prefix for this endpoint)

## Files Changed

| File | Change |
|------|--------|
| `apps/mobile/src/components/OnboardingOverlay.tsx` | New — 3-step onboarding |
| `apps/mobile/src/components/WordCard.tsx` | New — progressive disclosure word card |
| `apps/mobile/src/components/ContinueReadingCard.tsx` | New — continue reading + progress |
| `apps/mobile/app/reader/[bookSlug]/[chapterSlug].tsx` | WordCard integration, counters, onboarding, exit summary |
| `apps/mobile/app/(tabs)/index.tsx` | ContinueReadingCard, Start CTA, reviewed-today stat |
| `apps/mobile/src/lib/readerHtml.ts` | CSS tap-pulse + JS pulse applicator |
| `backend/src/Api/Endpoints/TranslationEndpoints.cs` | Compat route |
| `packages/shared/src/api/translation.ts` | Field name fix |

## Future Slices (Not Implemented)

- Slice 6: Language selection during onboarding
- Slice 7: Navigation restructure (Read/Discover/Library/Profile)
- Slice 8: Empty states
- Slice 9: Micro-animations (Apple-style)
- Slice 10: Full learning loop
- Web parity (after mobile validation)
