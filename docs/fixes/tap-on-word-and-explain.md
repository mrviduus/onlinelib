# Fix: domain-aware tap-on-word translation + Explain 404 + broken book title

This PR addresses three production bugs observed on textstack.app that together break the core "context-aware reader" promise from the README. Tackle in one PR — they're all in the same surface area.

## Bug 1 — Tap-on-word translation is dictionary-grade, not domain-aware

### Observed
- DDIA, tap "polling" with target Russian → popup shows `опросы` (electoral-polls meaning, wrong domain)
- DDIA chapter on data systems, tap "warehouse" with target Portuguese → `armazém` + dictionary def "A place for storing large amounts of products. In logistics, a place where products go to from the manufacturer..." — wrong domain, despite an explicit "Data warehouse" diagram in the same paragraph

### Root cause
- `apps/web/src/lib/wordBubbleFetch.ts:61` — `translateApi(word, bookLanguage, targetLang, signal)` is called with **no book context**.
- `apps/web/src/api/translation.ts:14–28` — sends only `{text, sourceLang, targetLang}`, no `editionId`/`bookId`/`sentence`.
- `backend/src/Api/Endpoints/TranslationEndpoints.cs:71–72` — current system prompt:
  ```csharp
  $"You are a translation engine. Translate from {srcLang} to {tgtLang}. " +
  "Output ONLY the translated text. No preface, no quotes, no explanation."
  ```
  No domain hint, no genre, no surrounding sentence. OpenAI defaults to the most common everyday meaning.

### Fix

**Backend `TranslationEndpoints.cs`:**

1. Extend `TranslateRequest` to optionally accept `Guid? BookId`, `string? Sentence`, `string? Genre`.
2. Mirror the genre-lookup pattern from `ExplainEndpoints.cs:44–65` — when `BookId` is present and `Genre` is null, look up genre from `Editions` first then `UserBooks`. Wrap in try/catch, log warning on failure, fall back to "general".
3. Replace the system prompt with:
   ```csharp
   var domainHint = string.IsNullOrWhiteSpace(genre)
       ? ""
       : $"Domain hint: {genre.Trim()}. Prefer the domain-specific meaning over the everyday meaning when the word is ambiguous. ";

   var sentenceCtx = string.IsNullOrWhiteSpace(sentence)
       ? ""
       : $"Sentence context: \"{sentence.Trim()}\". ";

   var systemPrompt =
       $"You are a translation engine for readers of technical books. " +
       $"Translate from {srcLang} to {tgtLang}. " +
       domainHint +
       sentenceCtx +
       "Output ONLY the translation. " +
       $"If the word has a domain-specific meaning that differs from its everyday meaning, " +
       $"append a SHORT clarifier in {tgtLang} parentheses, e.g. " +
       $"\"увага (механізм у нейромережах)\" or \"опитування (періодичний запит до сервера)\". " +
       "Otherwise output just the translation. No preface, no quotes, no markdown.";
   ```
   The parenthetical-clarifier pattern is what the README explicitly promises (`увага (механізм у нейромережах)`). Make sure the prompt encourages it.
4. Extend the cache key to include `genre` (or domain bucket). Otherwise the first-translated word poisons the cache for all readers across all genres.

**Frontend `apps/web/src/lib/wordBubbleFetch.ts` + `apps/web/src/api/translation.ts`:**

1. Update `translate()` signature to accept optional `bookId` and `sentence`.
2. In `fetchWordBubble()`, extract the surrounding sentence using the same logic that `ReaderHighlights.tsx` already uses to build the Explain payload (search the codebase for the existing helper — don't reimplement).
3. Pass the current book's id to the call. For curated books that's the `editionId`, for user books that's the `userBookId` — pass whichever is in scope, the backend already handles both via the `Editions` → `UserBooks` cascade.
4. When called from contexts without book scope (preview mode, marketing landing widget, etc.), omit the new fields — the backend gracefully falls back to context-free behavior.

## Bug 2 — `/explain` returns 404 in production

### Observed
On user-uploaded DDIA, select sentence with "polling" → click 💡 (Explain) → popup shows `Explain failed: 404`. Translation on the same selection works fine, so it's not a generic api outage.

### Root cause (suspected)
`backend/src/Api/Endpoints/ExplainEndpoints.cs:15` registers only the bare `/explain` route:
```csharp
var group = app.MapGroup("/explain").WithTags("Explain");
group.MapPost("", Explain).WithName("Explain").RequireRateLimiting("explain");
```

Compare with `TranslationEndpoints.cs:13–19`:
```csharp
var group = app.MapGroup("/api/translate").WithTags("Translation");
group.MapPost("", Translate).WithName("Translate").RequireRateLimiting("translate");
group.MapGet("/languages", GetLanguages).WithName("GetTranslationLanguages");

// Also map without /api/ prefix for nginx compatibility
app.MapPost("/translate", Translate).WithTags("Translation").WithName("TranslateCompat").RequireRateLimiting("translate");
```

Translation has dual-registration and a dedicated nginx location at `infra/nginx/textstack.conf:189`. Explain has neither. Likely a regression where Explain wasn't migrated when the dual-registration pattern was added, and a build of the frontend went out without `VITE_API_URL=/api` (or with it and nginx didn't have the explicit location to make the catchall work as expected).

### Fix

**Backend `ExplainEndpoints.cs`:**

Mirror `TranslationEndpoints.cs:13–19` exactly. Register Explain at both `/api/explain` and `/explain`:

```csharp
public static void MapExplainEndpoints(this WebApplication app)
{
    var group = app.MapGroup("/api/explain").WithTags("Explain");
    group.MapPost("", Explain).WithName("Explain").RequireRateLimiting("explain");

    // Also map without /api/ prefix for nginx compatibility
    app.MapPost("/explain", Explain).WithTags("Explain").WithName("ExplainCompat").RequireRateLimiting("explain");
}
```

**Frontend `apps/web/src/api/explain.ts`:**

Change the URL to be consistent with `translation.ts`:
```ts
const res = await fetch(`${API_BASE}/api/explain`, { ... })
```
Update the file's leading comment to match — the "Don't add `/api/` here" warning is misleading now.

**Nginx `infra/nginx/textstack.conf`:**

Optional but consistent — add a dedicated location with explain rate limit, mirroring `/api/translate` block at line 189:
```nginx
location /api/explain {
    limit_req zone=explain_limit burst=2 nodelay;
    proxy_pass http://textstack_api/explain;
    # ... copy headers from /api/translate block
}
```
Add `limit_req_zone ... zone=explain_limit:10m rate=20r/m;` near the other zones at the top of the file.

### Verification

After fix, on textstack.app:
1. Open any user-uploaded book → reader → select a sentence → click 💡 → expect 200 with 2-3 sentence explanation in target language.
2. Repeat on a curated library book → expect same behavior.
3. Hit `/api/explain` and `/explain` directly with curl — both should accept POST and return identical results.

## Bug 3 — Broken title `(for )` on book detail page

### Observed
Book detail page header reads **"Designing Data-Intensive Applications (for )"** with empty parentheses. Visible on user-uploaded DDIA (URL pattern `/library/my/{id}/`). Reader header carries the same broken title forward.

### Suspected root cause
A template like `"{title} (for {targetLanguage})"` or `"{title} (for {audience})"` with empty interpolation when the field is missing. Search for the literal `"(for "` or `(for {` in `apps/web/src/pages/` (likely `BookDetailPage.tsx` or user-book equivalent — given URL `/library/my/...` it's the user-book detail page, possibly `apps/web/src/pages/UserBookDetailPage.tsx` or similar).

### Fix
Conditional render: if the interpolated field is empty/null, omit the `(for )` segment entirely. Don't render an empty placeholder.

### Verification
Open `https://textstack.app/en/library/my/{any-user-book-id}/` — title should be `Designing Data-Intensive Applications` with no trailing parenthetical when the relevant field is empty.

## Verification — overall

After Bug 1 and Bug 2 fixes deploy, on textstack.app, with target Russian:

| Word | Book | Expected |
|------|------|----------|
| polling | DDIA, distributed systems chapter | `опрос (периодический запрос к серверу)` or similar |
| warehouse | DDIA, ETL chapter | `хранилище (хранилище данных)` or equivalent gloss |
| attention | any ML book | `внимание (механизм в нейросетях)` |
| eventual consistency | DDIA | `конечная согласованность` |
| polling | a poll-related news article (different genre) | `опросы` (everyday meaning preserved when domain doesn't suggest otherwise) |

The last row matters — make sure the domain hint *biases* the model but doesn't force technical meaning when the genre is wrong (e.g. if a user uploads a book of poetry, "warehouse" should still mean storage building).

For Bug 2: `/api/explain` and `/explain` both accept POST on textstack.app, both return identical results, neither 404s on user-uploaded books.

For Bug 3: book detail page never renders an empty `(for )` parenthetical.

## Out of scope

- Replacing Free Dictionary API entirely — keep the dictionary popup separate, it's the secondary fallback. Bug 1 fix only addresses the LLM-translation half of the popup.
- Translation latency / cost — `gpt-5-mini` handles word-level translations cheaply; no architecture change.
- The `Words read=0 / Sessions=7 / Reading time=5m` stats inconsistency on the same page (separate ticket — file separately).
