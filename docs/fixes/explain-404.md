# Fix: `/explain` returns 404 in production

## Observed (production)

On `textstack.app`, after fixes from `tap-on-word-and-explain.md` already shipped:

1. Open any user-uploaded book in the reader (URL pattern `/library/my/{id}/read/...`).
2. Select a sentence containing a technical term.
3. Click the 💡 Explain icon in the selection toolbar.

Expected: 2–3 sentence LLM explanation popup.
Actual: popup shows `Explain failed: 404`.

`/api/translate` on the same selection works correctly, so this is not a generic API outage — it's specific to the Explain endpoint.

## Root cause (confirmed)

Three asymmetries vs `Translate` (which works) cause this:

### Asymmetry 1 — backend route registration

`backend/src/Api/Endpoints/ExplainEndpoints.cs:13-17` registers ONE route only:

```csharp
public static void MapExplainEndpoints(this WebApplication app)
{
    var group = app.MapGroup("/explain").WithTags("Explain");
    group.MapPost("", Explain).WithName("Explain").RequireRateLimiting("explain");
}
```

Compare with `backend/src/Api/Endpoints/TranslationEndpoints.cs:11-20` which registers BOTH `/api/translate` and `/translate`:

```csharp
public static void MapTranslationEndpoints(this WebApplication app)
{
    var group = app.MapGroup("/api/translate").WithTags("Translation");

    group.MapPost("", Translate).WithName("Translate").RequireRateLimiting("translate");
    group.MapGet("/languages", GetLanguages).WithName("GetTranslationLanguages");

    // Also map without /api/ prefix for nginx compatibility
    app.MapPost("/translate", Translate).WithTags("Translation").WithName("TranslateCompat").RequireRateLimiting("translate");
}
```

The dual-registration is what makes Translate work regardless of which path the request arrives on. Explain doesn't have it.

### Asymmetry 2 — frontend URL

`apps/web/src/api/explain.ts:1-20` uses an inconsistent URL convention (and a misleading comment):

```ts
// API_BASE is the host (dev: http://localhost:8080) or `/api` (prod, nginx
// strips the prefix and proxies the rest to backend). Backend route is
// `/explain` (no prefix). Don't add `/api/` here or prod gets `/api/api/...`.
const API_BASE = import.meta.env.VITE_API_URL ?? ''

// ...

export async function explain(req: ExplainRequest, signal?: AbortSignal): Promise<ExplainResponse> {
  const res = await fetch(`${API_BASE}/explain`, {
```

Compare with `apps/web/src/api/translation.ts:32` which uses the `/api/` prefix:

```ts
const res = await fetch(`${API_BASE}/api/translate`, {
```

The "Don't add `/api/`" warning in the explain.ts comment is wrong as of the deployed prod build — `VITE_API_URL` is set to `/api` in prod (see `docker-compose.yml:143`, `Makefile:47`, `.github/workflows/deploy.yml:52`), so the comment's "or prod gets `/api/api/...`" scenario would actually be **the working** scenario for some routes (Translate's backend mounts both paths, so `/api/api/translate` is handled at backend by the `/api/translate` registration). Explain's backend mounts only `/explain`, so neither path reaches it cleanly.

### Asymmetry 3 — nginx (cosmetic, but a consistency miss)

`infra/nginx/textstack.conf:188-199` has a dedicated rate-limited location for translate:

```nginx
# Translation endpoint — stricter per-IP rate limit
location /api/translate {
    limit_req zone=translate_limit burst=2 nodelay;
    proxy_pass http://textstack_api/translate;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Site-Id general;
    proxy_set_header Connection "";
}
```

No equivalent `/api/explain` block exists, so Explain falls through to the generic `/api/` catchall — which is fine in principle, but means there's no per-endpoint rate limiting.

## Fix — exact diffs

### Diff 1: `backend/src/Api/Endpoints/ExplainEndpoints.cs`

Replace lines 13–17 with:

```csharp
public static void MapExplainEndpoints(this WebApplication app)
{
    var group = app.MapGroup("/api/explain").WithTags("Explain");
    group.MapPost("", Explain).WithName("Explain").RequireRateLimiting("explain");

    // Also map without /api/ prefix for nginx compatibility — mirrors
    // TranslationEndpoints. Without this the endpoint 404s in production when
    // nginx forwards requests stripped of the /api/ prefix and the build
    // happens to ship a frontend bundle that hits the bare path.
    app.MapPost("/explain", Explain).WithTags("Explain").WithName("ExplainCompat").RequireRateLimiting("explain");
}
```

### Diff 2: `apps/web/src/api/explain.ts`

Replace lines 1–4 with:

```ts
// API_BASE is the host in dev (http://localhost:8080) or "/api" in prod
// (nginx routes /api/* to the backend). Use the same /api/ prefix as
// translation.ts — backend mounts the Explain handler at BOTH /explain and
// /api/explain (see ExplainEndpoints.cs), so this works in either env.
const API_BASE = import.meta.env.VITE_API_URL ?? ''
```

Replace line 20:

```ts
  const res = await fetch(`${API_BASE}/explain`, {
```

with:

```ts
  const res = await fetch(`${API_BASE}/api/explain`, {
```

### Diff 3: `infra/nginx/textstack.conf`

Above the existing `location /api/translate { ... }` block at line 188, add a new explain rate-limit zone. Find the existing rate-limit zones near the top of the file (probably `limit_req_zone ... zone=translate_limit:10m rate=5r/m;` or similar) and add:

```nginx
limit_req_zone $binary_remote_addr zone=explain_limit:10m rate=20r/m;
```

Then between lines 199 and 200 (after the translate location, before the generic `/api/` block at 202), add:

```nginx
# Explain endpoint — per-IP rate limit, same shape as translate.
location /api/explain {
    limit_req zone=explain_limit burst=2 nodelay;
    proxy_pass http://textstack_api/explain;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Site-Id general;
    proxy_set_header Connection "";
}
```

The backend already has a `RequireRateLimiting("explain")` policy at `Program.cs:253`, so the nginx zone is defense-in-depth, not the only line. If you'd rather rely on the backend limiter and skip nginx changes, that's acceptable — the route fix above is what makes Explain work; nginx is consistency-only.

## Verification

After deploying, run:

```bash
# 1. Both routes accept POST (backend dual-registration check).
curl -i -X POST https://textstack.app/api/explain \
  -H "Content-Type: application/json" \
  -d '{"word":"polling","sentence":"the client repeats the query every 5 seconds (this is known as polling).","targetLang":"ru","genre":"computer science"}'
# Expected: HTTP 200 with JSON {explanation, word, cached}

curl -i -X POST https://textstack.app/explain \
  -H "Content-Type: application/json" \
  -d '{"word":"polling","sentence":"the client repeats the query every 5 seconds (this is known as polling).","targetLang":"ru","genre":"computer science"}'
# Expected: HTTP 200 with identical JSON shape (might hit cache from previous call)
```

Both should return 200, not 404. The explanation text in the response should be 2–3 sentences in Russian explaining the distributed-systems meaning of "polling" (periodic client query, not electoral polls).

Then in the UI:

1. Sign in, open any user-uploaded book → reader → select a sentence → click 💡 → expect a 2–3 sentence explanation popup, not `Explain failed: 404`.
2. Repeat on a curated library book → same behavior.

## P.S. — sanity-check Bug 1 runtime while you're in there

Bug 1 from the previous brief (`tap-on-word-and-explain.md`) is wired correctly end-to-end in the code, but the live production behavior on `warehouse` in a DDIA upload still shows `almacén` without the README-promised parenthetical clarifier (`almacén (almacén de datos)`). Likely cause: the user-book's `Genre` field is NULL in the DB because `BookMetadataGenerator` (Ollama, fire-and-forget) hasn't populated it. With `genre = null`, the prompt still has `sentence` but no `Domain hint:` line, so `gpt-5-mini` may not consistently trigger the clarifier path.

Quick diagnostic (one query):

```sql
SELECT id, title, genre FROM user_books WHERE title ILIKE '%data-intensive%' OR title ILIKE '%DDIA%';
```

If `genre` is NULL: either backfill it from the title/description for a sample of books, OR strengthen the prompt to derive a domain hint from the sentence alone when genre is missing (e.g. add: "If no domain hint is given, infer one from the sentence context."). Out of scope for this PR — file as a follow-up.
