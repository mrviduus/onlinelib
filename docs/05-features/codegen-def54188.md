# PDD: Remove typed_recall review mode from Vocabulary SRS

## Status
Completed

## Goal
Remove the `typed_recall` (type-the-word) review mode from vocabulary SRS. Users should only see `multiple_choice` and `context` (fill-in-the-blank) cards — no free-form typing of the word.

## Non-goals
- Changing the SRS stage progression logic (stages 0–4 stay the same)
- Changing the `context` card (fill-in-the-blank with sentence) — it still requires typing
- Removing the `useCardAnswer` hook (still used by ContextCard)
- Changing how review submissions are stored in DB (historical `typed_recall` records stay)

## Plan

### Slice 1: Backend — Remove typed_recall from SRS engine and card builder ✅
**Files:**
- `backend/src/Vocabulary/TextStack.Vocabulary/SrsEngine.cs` — Replace `typed_recall` with `multiple_choice` (stages 2, 3 without sentence, 4 without sentence) and `context` (stages 3-4 with sentence)
- `backend/src/Vocabulary/TextStack.Vocabulary/ReviewCardBuilder.cs` — Remove MC→typed_recall fallback (line 40); when MC can't build proper options, still return MC with whatever distractors available
- `tests/TextStack.UnitTests/SrsEngineTests.cs` — Update expected review modes

### Slice 2: Frontend web — Remove TypedRecallCard and references ✅
**Files:**
- `apps/web/src/pages/VocabularyReviewPage.tsx` — Remove TypedRecallCard import and render branch
- `apps/web/src/components/vocabulary/TypedRecallCard.tsx` — Delete file
- `apps/web/src/api/vocabulary.ts` — Remove `typed_recall` from ReviewCardDto type union
- `apps/web/src/styles/vocabulary.css` — Remove `.review-typed*` CSS classes
- `apps/web/src/locales/en.json` — Remove `typeWord` key
- `apps/web/src/locales/uk.json` — Remove `typeWord` key
- `apps/web/e2e/tests/vocabulary.spec.ts` — Remove typed_recall handling from E2E
- `packages/shared/src/types/api.ts` — Remove `typed_recall` from type union

### Slice 3: Mobile — Remove TypedRecallCard from mobile app ✅
**Files:**
- `apps/mobile/app/vocabulary/review.tsx` — Remove TypedRecallCard function and `typed_recall` branch in CardRenderer

## Verification
- `dotnet build` passes
- `dotnet test tests/TextStack.UnitTests` passes (SrsEngine tests updated)
- `pnpm -C apps/web tsc --noEmit` passes
- No references to `typed_recall` in SrsEngine or ReviewCardBuilder
- ReviewCardDto type only has `multiple_choice | context`
