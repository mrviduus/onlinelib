# Slice 17 — AI auto-tags via Ollama

**Phase:** 4 (AI + polish) · **Estimated:** 1 day · **Risk:** low · **Flag:** `myBooksV2.aiTags`

## Goal

After ingestion completes, Ollama proposes 3–5 tags for the book based on title + author + first chapter excerpt. User reviews and approves with one click. Reduces friction of manual tagging from slice 12.

## Acceptance criteria

1. After successful ingestion (status → `Ready`), worker triggers `TagSuggestionGenerator` (Ollama call, fire-and-forget like `BookMetadataGenerator`).
2. Suggested tags stored on `UserBook.SuggestedTags string[]` (jsonb), separate from confirmed `Tags`.
3. Library card shows a small "✨ Suggested tags" pill if `SuggestedTags` non-empty AND `Tags` empty. Click → opens approval popover with 3–5 chip suggestions, each with checkbox.
4. User picks which to add; click "Add selected" → tags merged into `Tags`, `SuggestedTags` cleared.
5. "Dismiss" button clears suggestions without adding.
6. Suggestion generation is best-effort: fails silently if Ollama unreachable (logged, not user-facing).
7. Suggestions in user's UI language (per `NativeLanguage`) — Ollama prompt parameterized.
8. Behind feature flag `myBooksV2.aiTags`.

## Files to touch

| File | Change |
|---|---|
| Backend: `backend/src/Domain/Entities/UserBook.cs` | Add `List<string> SuggestedTags { get; set; } = new();` (jsonb). |
| Backend: migration `AddSuggestedTagsToUserBook` | EF migration. |
| Backend: `backend/src/Worker/Services/TagSuggestionGenerator.cs` | **New.** Ollama call after ingestion. Mirrors pattern from `BookMetadataGenerator.cs`. |
| Backend: `backend/src/Worker/Services/IngestionWorkerService.cs` | After ingestion success, schedule `TagSuggestionGenerator` via `IServiceScopeFactory`. |
| Backend: `backend/src/Api/Endpoints/UserBooksEndpoints.cs` | Add `POST /me/books/{id}/suggested-tags/accept` (body: `{accepted: string[]}`) — moves accepted into Tags, clears suggestions. Add `POST /me/books/{id}/suggested-tags/dismiss`. |
| `apps/web/src/components/library/SuggestedTagsPopover.tsx` | **New.** Popover with checkboxes. |
| `apps/web/src/components/library/UserBookCard.tsx` | Render suggestion pill when applicable. |
| `apps/mobile/...` | Mirror. |
| `apps/web/src/locales/en.json` + mobile | All AI tag labels. |

## Implementation notes

- **Ollama prompt:**
  ```
  Suggest 3 to 5 short tags (single word or short hyphenated phrase, lowercase) 
  for a book with the following metadata. Tags should describe genre, themes, 
  audience, or notable characteristics. Return as a JSON array of strings only.
  
  Title: {title}
  Author: {author}
  Language: {language}
  First chapter excerpt (200 words): {excerpt}
  
  Tags should be in {userNativeLanguage}.
  ```
- **Model:** reuse existing `Ollama:Model` config (`gemma4:e2b` per CLAUDE.md). No new model.
- **Timeout:** 30s (matches existing). On timeout/error, log and skip — never block ingestion.
- **Validation:** parsed tags must be 1–30 chars, lowercase, alphanumeric+hyphen. Drop invalid silently.
- **De-duplicate** suggestions against user's existing tags (via `useUserTags()` data).
- **One-time suggestion:** if user dismisses, don't regenerate. Re-process action regenerates.

## Out of scope

- Auto-apply tags without confirmation — too presumptuous.
- AI-generated collections — out of scope.
- Multilingual model swap — use existing model with prompt in target language.

## Tests

**Unit:**
- `TagSuggestionGenerator.test.cs`: parses valid response, drops invalid tags, handles Ollama timeout gracefully.
- `SuggestedTagsPopover.test.tsx`: renders 3–5 chips, checkboxes work, accept calls API.

**Integration:**
- `dotnet test tests/TextStack.IntegrationTests --filter SuggestedTags`: accept moves suggestions to Tags atomically; dismiss clears.

**E2E:**
- Upload book → wait for processing → suggestion pill appears within 30s — assert popover content sensible (3–5 lowercase tags).
- Accept 2 of 3 → assert `Tags` contains the 2, suggestion pill gone.

## Done criterion

```bash
pnpm -C apps/web test --filter "SuggestedTagsPopover"
pnpm -C apps/web test:e2e --grep "ai-tags"
pnpm -C apps/web build
dotnet test tests/TextStack.IntegrationTests --filter SuggestedTags
cd apps/mobile && npx tsc --noEmit

# Smoke: spin up Ollama locally, upload, observe suggestions land
```

## Rollback plan

Toggle `myBooksV2.aiTags` to `false`. Worker still generates (cheap, harmless), UI hides pill. Backend column stays.

## Follow-ups

- Periodic regeneration for books that change (re-process triggers fresh suggestions).
- "Why these tags?" explanation popover — Phase 4 polish.
- Allow user to provide custom tag categories ("genre only", "tone tags", etc.).
