# Vocabulary SRS (Spaced Repetition System)

Save words while reading, review with spaced repetition quizzes.

## Architecture

```
Reader (word select) → POST /me/vocabulary/words → DB save
                                                  → fire-and-forget: Ollama → distractors → DB update

Review page → GET /me/vocabulary/review → SRS queue (due words)
           → POST /me/vocabulary/review → SrsEngine.Calculate() → stage/interval update
```

## SRS Stages

| Stage | Name | Review Mode | Interval |
|-------|------|------------|----------|
| 0 | New | multiple_choice | immediate |
| 1 | Recognition | multiple_choice | 1 day |
| 2 | Recall | typed_recall | 3 days |
| 3 | Context | context (fill-in-blank) | 7 days |
| 4 | Mastered | typed_recall or context | 14d → 60d (2x multiplier) |

**Promotion**: Stage 0 needs 1 correct, stages 1-3 need 2 consecutive correct to advance.
**Demotion**: Wrong answer drops 1 stage (mastered drops to recall, not context).

Logic: `backend/src/Application/Vocabulary/SrsEngine.cs`

## Review Modes

1. **multiple_choice** — Show definition/translation, pick correct word from 4 options
2. **typed_recall** — Show definition/translation, type the word
3. **context** — Show sentence with blank, type the missing word

### MC Fallback Cascade
When building MC prompt: definition → translation → blank sentence (if LLM distractors exist) → downgrade to context/typed_recall.

## Ollama LLM Distractors

MC quiz quality depends on plausible wrong answers. Random words = too easy.

**Solution**: Local Ollama LLM (`gemma4:e2b`) generates 5 semantically similar distractors per word.

### Flow
1. User saves word in reader → API saves to DB immediately (fast response)
2. Fire-and-forget `Task.Run` with `IServiceScopeFactory` → new DB scope
3. `DistractorGenerator.GenerateAsync()` → Ollama `/api/generate` → parse comma-separated response
4. Store JSON array in `vocabulary_words.distractors`
5. If Ollama fails → fallback to random words from user's vocab pool at review time

### Docker
```yaml
ollama:
  image: ollama/ollama
  container_name: textstack_ollama
  volumes:
    - ./data/ollama:/root/.ollama
  healthcheck:
    test: ["CMD-SHELL", "ollama list >/dev/null 2>&1 || exit 1"]
  deploy:
    resources:
      limits:
        memory: 4G
```

Config: `Ollama:BaseUrl`, `Ollama:Model` (gemma4:e2b), `Ollama:TimeoutSeconds` (10)

### Model Pull
```bash
docker compose exec ollama ollama pull gemma4:e2b
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/me/vocabulary/words` | Save word (+ async distractor gen) |
| GET | `/me/vocabulary/words` | List words (filter, sort, search, pagination) |
| PUT | `/me/vocabulary/words/{id}` | Update translation |
| DELETE | `/me/vocabulary/words/{id}` | Delete word |
| GET | `/me/vocabulary/review?limit=20` | Get review queue (due words) |
| POST | `/me/vocabulary/review` | Submit answer → SRS update |
| GET | `/me/vocabulary/stats` | Today's reviews, correct rate, streak |

## Frontend

| File | Purpose |
|------|---------|
| `pages/VocabularyPage.tsx` | Word list, filters, stats cards |
| `pages/VocabularyReviewPage.tsx` | Review session orchestrator |
| `components/vocabulary/MultipleChoiceCard.tsx` | MC quiz card |
| `components/vocabulary/TypedRecallCard.tsx` | Type-the-word card |
| `components/vocabulary/ContextCard.tsx` | Fill-in-the-blank card |
| `components/vocabulary/ReviewFeedback.tsx` | Correct/wrong feedback + stage change |
| `components/vocabulary/SessionSummary.tsx` | End-of-session stats |
| `hooks/useVocabulary.ts` | Word CRUD + filtering |
| `hooks/useVocabularyReview.ts` | Review session state machine |
| `api/vocabulary.ts` | API client methods + DTOs |

## E2E Tests

`apps/web/e2e/tests/vocabulary.spec.ts` — 10 tests covering:
- Empty state for new user
- Save words via API → word list renders
- Filter tabs (New/Learning/Mastered)
- Search filters words
- Start review → MC card with 4 options
- Correct MC answer → green feedback
- Complete session → summary screen
- Navigate back from summary
- Expand word → detail panel
- Delete word → count decreases

Helper: `apps/web/e2e/helpers/vocabulary.ts` — `saveTestWords()`, `deleteAllTestWords()`

## Database

See [database.md](../02-system/database.md#vocabulary-tables) for full schema.

Key tables: `vocabulary_words`, `vocabulary_reviews`
