# Changelog

## [Unreleased]

### Phase 8 — MCP stdio server skeleton (AI-047) (2026-06-16)

First PR of Phase 8: a new executable that exposes the TextStack library to MCP clients (Claude Desktop, IDE agents, …) over **stdio**, completing the full `initialize` → `tools/list` → `tools/call` lifecycle with ONE end-to-end tool — `search_books`. Foundation for the 7-tool surface (AI-048..053); structured so later tools just append a descriptor.

- **Official SDK, not hand-rolled JSON-RPC.** New `backend/src/Ai/TextStack.Ai.Mcp` (`<OutputType>Exe</OutputType>`, net10) builds on the official `ModelContextProtocol` C# SDK (MS/Anthropic), pinned **1.4.0** (latest stable, 2026-06-04) centrally in `Directory.Packages.props`. The SDK ships the stdio transport + protocol types; we don't touch framing ourselves. **Decision: SDK over a hand-rolled transport** — battle-tested framing/capability negotiation, and it tracks the spec.
- **HTTP-bridge architecture (stateless), not in-process.** The mcp-server is a thin MCP↔HTTP adapter: each tool call becomes an HTTP request to the existing public API (`GET /search?q=`), reusing the endpoint's validation, `SiteContextMiddleware` site resolution, and (later) the spoiler gate. It does **NOT** reference `Application`/`Infrastructure`, has **NO** DB/EF/OpenAI. **Decision: bridge over in-process** — keeps the server deployable standalone, makes tool SCHEMAS the single source of truth ("one tool definition, three consumers") while invocation stays HTTP, and avoids dragging the layered backend into an stdio process. `TEXTSTACK_API_URL` (default `https://textstack.app/api`), `TEXTSTACK_SITE_HOST` (default `textstack.app`, sent as the Host header so `/search` resolves the site), `TEXTSTACK_MCP_TOKEN` reserved for AI-050 (unused now).
- **Runtime tool catalog, not `[McpServerTool]` attributes.** `Tools/McpToolCatalog.cs` holds a list of `McpToolDescriptor` (name + description + JSON-Schema + handler delegate). `tools/list` and `tools/call` are served from this catalog via the SDK's **low-level handler API** — `AddMcpServer(options => options.Handlers = new McpServerHandlers { ListToolsHandler = …, CallToolHandler = … })` wired through `McpServerOptions` (the actual 1.4.0 surface; handler delegates are `McpRequestHandler<TParams,TResult>` = `ValueTask<TResult>(RequestContext<TParams>, CancellationToken)`, args arrive as `IDictionary<string,JsonElement>` and are reassembled into one args object for the catalog). AI-048+ append a descriptor; no reflection, no SDK tool model — and crucially **no `ITool`**, so the StudyBuddy Application set-equality test is untouched.
- **The one tool — `search_books`.** Schema `{ query: string(2..200, required), limit: integer(1..50) }`, `additionalProperties:false`. Handler validates args (the low-level path doesn't auto-validate against InputSchema, so the catalog mirrors the schema), calls `GET /search`, maps `PaginatedResult<SearchResultDto>` → a compact `{ title, author, chapterTitle, editionSlug, snippet }[]` returned as an MCP text content block. HTTP error / no results → a clean `{ "results": [] }` (data for the model, not an exception).
- **stdio correctness gate.** stdout carries **ONLY** JSON-RPC framing; ALL logging is routed to stderr (`AddConsole(o => o.LogToStandardErrorThreshold = Trace)`), and the project bans `Console.Write*`. `initialize` advertises the `tools` capability only (serverInfo name `textstack`, version from assembly); clean shutdown on stdin EOF / SIGINT via the Generic Host + SDK transport. Verified manually over a real stdio pipe: `initialize` + `tools/list` + `tools/call` all return correct frames with an empty stdout otherwise.
- **HTTP-bridge robustness (P2 hardening).** Transport (DNS/connection → `HttpRequestException`), parse (non-JSON 200 body, e.g. a CF/nginx HTML error page or truncated stream → `JsonException`), and TIMEOUT failures now become a **clean MCP tool error** (`IsError` result, short non-leaky text `search_books failed: …`) instead of propagating as a JSON-RPC **protocol fault** — an interactive client (Claude Desktop) sees a usable message and the session continues. The catalog handler wraps the `SearchBooksAsync` call; a **15s** client timeout (`http.Timeout`, matches the TTS convention, overridable via `TEXTSTACK_MCP_TIMEOUT_SECONDS`) bounds a stuck upstream (was the HttpClient default 100s hang) and surfaces as a timeout→`IsError` in ~15s. **Cancellation vs timeout is distinguished** via `catch (OperationCanceledException) when (!ct.IsCancellationRequested)`: a real client disconnect (caller token cancelled) **propagates** (cooperative cancellation, the SDK ends the call); only the HttpClient self-timeout (same exception shape but caller token NOT cancelled) is converted to `IsError`. Non-success STATUS codes keep their existing "no data → empty `{ "results": [] }`" behaviour — only transport/parse/timeout EXCEPTIONS change. Stdout stays protocol-only (the result flows through the SDK).
- **Tests** (`tests/TextStack.UnitTests/McpServerTests.cs`, CI-safe, NO network, NO subprocess): a fake `HttpMessageHandler` feeds the catalog a canned `PaginatedResult<SearchResultDto>`; assertions cover (a) `tools/list` exposes `search_books` with the exact args schema, (b) the handler issues `GET /search?q=…&limit=…` with the Host header and maps to the expected MCP text shape, (c) limit omitted when absent, (d) API BadRequest → empty results, (e) invalid args (missing/typed/short query, out-of-range/typed limit, extra prop) → tool error that never hits HTTP, (f) unknown tool → tool error, (g) **P2 robustness**: malformed 200 body / connection failure / HttpClient-timeout → clean `IsError` (no throw), and a genuinely-cancelled caller token → cancellation propagates (not swallowed). 36 tests; over-the-wire transport coverage deferred to AI-053 integration.

### Phase 7 — A/B eval: crew vs single-call on goldens (AI-046) (2026-06-16)

The Phase 7 DoD gate that answers "does the four-agent crew actually earn its orchestration?" — it A/B's the full `FieldCrew` (researcher→drafter→critic→editor) against **one** single LLM call that writes the field directly, on the same brief+source, and gates on a meaningful quality **lift** AND a bounded **cost ratio**. Backend core only; the admin "Run A/B" button is a deliberate fast-follow.

- **Honest baseline (A) — same brief contract, only orchestration differs.** New `Application/Agents/BaselineFieldAgent.cs` (`SingleCallAgent<BaselineInput, Draft>`, FeatureTag `crew.baseline`): one gateway call whose system prompt folds the brief's FULL contract (MinLength/MaxLength, BannedPhrases, StyleGuide, TargetLanguage) via the shared `BriefConstraints` the drafter/critic/editor already use — so A is held to the identical rubric the crew enforces; the user prompt is the raw source. New `Prompts/BaselineFieldPrompt.cs` + `record BaselineInput(ContentBrief Brief, string SourceMaterial)`. **A and B run the SAME generator model (nano)** — the eval isolates orchestration, not model.
- **Independent judge, no label leakage.** A stronger judge (gpt-4.1 via `Eval:JudgeModel`, the dedicated `openai-judge` keyed provider) scores each candidate **absolutely** on a 3-axis 1-5 prose rubric (grounding / tone / completeness) through the shared `RubricEvaluator`. A and B are judged in **separate** calls with the **same** rubric, and the judge prompt carries only the source + an anonymous candidate — it never learns "single-call" vs "crew".
- **Metrics + gate** (`Ai.EvalSuite/CrewAbEvalRunner.cs`): per fixture `judgeScoreA/judgeScoreB (0-5)`, `costA/costB`, `bWins`. Aggregate `avgA`, `avgB`, `liftPct = (avgB-avgA)/avgA`, `costRatio = sumCostB/sumCostA`, `winRate`. `Passed = liftPct >= 0.10 && costRatio <= 2.0` — **the cost gate is independent of lift** (better-but-too-expensive still fails). Div-by-zero guarded: `avgA==0 → lift 0`; `sumCostA==0 → costRatio +inf → fails`. **A's cost** = the single call's `LlmResponse.Usage.CostUsd`; **B's cost** = the crew run's TOTAL (sum of the 4 sub-agent usages) — surfaced honestly via a new additive `FieldResult.CostUsd` (populated from `CrewResult.Usage.CostUsdTotal`; no other caller churns).
- **Crew halt → B scores 0.** If the crew halts before the editor (null `EditedText`), B is judged 0 for that case (no prose to judge); `NeedsReview==true` does NOT zero B — quality A/B is separate from the review gate, so a flagged-but-present edit is still judged.
- **Golden set** (`Datasets/crew_ab.json`, auto-embedded via the existing `Datasets/*.json` glob): **N=10 edition/description** fixtures (realistic title+author+excerpt-style book source, varied — Frankenstein, Dracula, Moby-Dick, …) resolved to a `ContentBrief` via `SeoBriefs.For("edition","description","en")`. `// TODO grow to 50`. The gate runs on whatever N is present. New `CrewAbGolden` record + `CrewAbGoldenSet.Load()` (mirrors `CriticDefectGoldenSet`).
- **Reuses, no schema change**: persists a `crew_ab` `EvalRun` (Feature=`crew_ab`, Score=round(liftPct,3), JudgeModelId=judge model, BreakdownJson = `{avgA, avgB, liftPct, costRatio, winRate, n, perFixture[]}`). Endpoint `POST /admin/ai-quality/evals/crew-ab/run` mirrors `studybuddy`/`criticdefects`: resolve the gateway `ILlmService` (503 if no key), the keyed `openai-judge` + `Eval:JudgeModel`, build `BaselineFieldAgent` + resolve `FieldCrew` from scope, run + persist, return `{ avgA, avgB, liftPct, costRatio, winRate, n, passed, cases }`. Structurally mirrors `CriticDefectEvalRunner` (AI-044).
- **Tests** (`tests/TextStack.AiEvals/CrewAbEvalRunnerTests.cs`, deterministic, fake-gen + fake-judge, **NO key, CI**): a fake generator routed by FeatureTag (`crew.baseline`→A text+cost; `crew.drafter`/`critic`/`editor`/`researcher`→B sub-agent texts+cost) + a fake judge returning canned scores keyed on which candidate marker is in the prompt, run **through the real `RubricEvaluator`** + the reused `IAgentRunWriter`/`CapturingDb` fakes. Covers: `BFarBetter_Passes` (lift≈0.67 ∧ ratio≤2), `BNotBetter_Fails` (lift≈0), `BBetterButTooExpensive_Fails` (cost gate alone fails despite lift), `BWorse_NegativeLift_Fails`, `CrewHalted_NullEditedText_ScoresZero`, `Persist_WritesCrewAbEvalRun` (Feature/Score/BreakdownJson shape/N/JudgeModelId). No `ITool` introduced — the StudyBuddy set-equality test stays green.

### Phase 7 — admin "view transcript" UI for crew/agent runs (AI-045) (2026-06-15)

Makes the multi-agent reasoning chain inspectable. Every crew run (`crew.autopublish`/`crew.seo`) and single-agent run (`studybuddy`) already persists an `agent_run` row with a nested-step transcript (researcher→drafter→critic→editor); AI-045 surfaces it in the admin app. **No schema change, no new table** — read-only over the existing Phase 6 `agent_run`.

- **Backend** (`Api/Endpoints/AdminAiQualityEndpoints.cs`, mirrors the existing `GetTraces`/`GetTrace`): `GET /admin/ai-quality/agent-runs?agent=&limit=&offset=` (list, newest-first, `agent` filter = exact-or-prefix so `crew.` narrows to all crew runs; clamp 1–100; **list projection omits the heavy `StepsJson`+`Output`** and truncates `Goal` to 120 chars — guarded `Length > 120 ? Goal[..120] : Goal`) and `GET /admin/ai-quality/agent-runs/{id}` (detail, full **raw** `StepsJson` + `Output`, 404 on unknown). DTOs in `Contracts/Admin/AiQualityDtos.cs` (`AgentRunListItemDto`/`AgentRunsPageDto`/`AgentRunDetailDto`). `StepsJson` is passed through RAW and parsed client-side — same pattern as `TraceDetailDto`'s `MessagesJson`/`ToolCallsJson`; no brittle second server-side schema.
- **Frontend** (`apps/admin/src/pages/AiQualityPage.tsx`, new `Transcripts` tab modeled on `TracesTab`/`TraceModal`): filterable list (All / `crew.autopublish` / `crew.seo` / `studybuddy`) + pager → click row → modal. The modal parses `stepsJson` into the step tree: each `sub_agent` step is a collapsible `{stage} · {agentName}` panel with its per-step usage; the **critic** panel is special-cased + default-expanded — its inner `llm_response` JSON is rendered as score chips (factual_accuracy/tone/length/banned_phrases) + a severity-colored issue list (blocker red / major amber / minor gray). Single-agent steps (`llm_response`/`tool_result`) render via `pretty()`. Every layer is defensive — a malformed/empty/non-JSON step falls back to raw and never throws.
- **The JSON casing contract is the load-bearing risk** (a mismatch = blank transcript). The writer `DbAgentRunWriter` serializes `run.Steps` with **default** STJ options (unaffected by the HTTP pipeline's web-defaults), so the shape is mixed: top-level `AgentStep` records → PascalCase (`Index`/`Kind`/`Payload`/`At`), the `sub_agent` payload anon-object → camelCase (`stage`/`agentName`/`status`/`usage`/`steps`), the nested `AgentUsage` record → PascalCase again, inner `llm_response` payload `new { text }` → camelCase. The frontend reads each exactly. **`CrewTranscriptJsonContractTests`** (pure, no DB) serializes a real 4-stage `crew.autopublish` run through the same factory+options and asserts every key the UI depends on, **with negative asserts** so the test fails loudly if anyone ever puts camelCase/web options on the writer.
- Entry points from the AutoPublish/SEO pages (deep-link by the runIds those `crew-generate` endpoints already return) are a deliberate fast-follow; this PR is the self-contained AI-quality tab. Admin-only (`/admin/*` auth) — the `Goal` can carry user passages / book source, acceptable for the owner's own audit surface.

### Phase 7 — synthetic-defect critic harness (AI-044) (2026-06-15)

A calibration gate for the AI-041 `CriticAgent`: instead of trusting that the critic *would* catch a bad draft, we inject KNOWN defects into clean drafts and measure whether it actually does. ~23 fixtures over a single edition-description `ContentBrief` (`AutoPublishBriefs.Description("en")` — real 800–1600 char bounds + the shared `CrewBannedPhrases` blocklist): factual_hallucination ×6, banned_phrase ×4, length over/under ×2+2, tone_break ×4, plus 5 clean controls. The harness mirrors `ToolCallEvalRunner` exactly — real nano per case, **pure deterministic scoring, no judge**, `JudgeModelId="n/a"`, persists a reused `EvalRun` (**no schema change**), Score = catch-rate.

- **Deterministic injector** (`CriticDefectInjector`, pure — no LLM, no randomness): factual → append a fabricated sentence absent from the research notes; banned_phrase → splice a blocklist phrase mid-prose; length_over → pad to ~1.5× MaxLength; length_under → truncate to ~½ MinLength; tone_break → inject a first-person/casual marketing aside; clean → untouched. Same golden always yields the same injected text, so injection itself is the CI-testable unit. **QA hardening:** the length defects now breach by a WIDE margin (over ≈877 chars past MaxLength, under ≈400 chars below MinLength) instead of the old <1%/2.5% overshoot a nano critic couldn't reliably eyeball — so a length miss reflects critic quality, not an ambiguous-by-design fixture.
- **Catch-rate scoring** (`CriticDefectEvalRunner`): a defect is "caught" when the critic scores its expected axis ≤2 (1–5, 1=worst), OR raises a blocker/major issue keyword-matched to that axis (factual/banned), OR fails to parse (fail-closed reject counts as caught for ANY defect). A clean control is "flagged" (→ a false positive) on any blocker issue, any axis ≤2, or a parse failure. **The gate now spans BOTH metrics:** `Passed => CatchRate ≥ 0.80 (CatchRateGate) AND FalsePositiveRate ≤ 0.20 (FalsePositiveGate)`. This closes the QA-flagged honesty hole where a flag-everything critic (catch-rate 1.0 **by** flagging every clean control, FP 1.0) reported success — the whole point of a calibration harness is to reject exactly that. FP-rate is **division-guarded** (0 controls → 0.0, never NaN). Both rates stay in the result + `BreakdownJson` + the endpoint JSON. Per-axis catch-rate + counts-by-type in `BreakdownJson`. The runner only computes + persists; the live-run consumer reads `Passed`.
- **Clean controls hardened (QA):** the 5 false-positive controls (and the base prose of every defect fixture) are now genuinely neutral encyclopedic third-person prose fully grounded in their research notes — the self-referential meta-phrases ("According to the source material", "Drawing its facts from the source", "Grounded in the facts of the source") were scrubbed, since a correctly-strict critic legitimately flags those as ungrounded/non-encyclopedic, falsely inflating FP. Controls re-verified in-bounds [800,1600]: clean_01 850, clean_02 829, clean_03 824, clean_04 822, clean_05 824.
- **Live run** is admin-triggered + synchronous (~23 nano calls), `POST /admin/ai-quality/evals/criticdefects/run` → resolves the gateway `ILlmService` (503 if no OpenAI key), runs `new CriticAgent(llm)`, returns `{ catchRate, falsePositiveRate, n, passed, cases }`. The **deterministic half runs in CI with NO key** — the new tests use a fake critic.
- Tests (`tests/TextStack.AiEvals`, fake `ILlmService`, no key/network): `CriticDefectInjectorTests` — length_over overshoots MaxLength by a wide margin, length_under undershoots MinLength by a wide margin, banned phrase substring present, fabricated sentence appended + absent from notes, clean unchanged + in-bounds, determinism, taxonomy shape. `CriticDefectEvalRunnerTests` — "catches-all" critic → catch-rate 1.0 + FP 1.0 but **Passed==false** (FP gate); a well-calibrated critic (catch 1.0, FP 0.0) → **Passed==true**; a noisy critic (catch 1.0, FP 0.4 just over the 0.20 gate) → **Passed==false**; "catches-none" → 0.0/0.0; a realistic length-and-banned-only critic → exactly those axes caught + 0 false positives; persist:true writes one `criticdefects` `EvalRun` with the per-axis BreakdownJson (via a minimal capturing `IAppDbContext`, no EF-InMemory dependency).
- Admin UI button is a deliberate follow-up (backend core only).

### Phase 7 — in-process SeoCrew admin path (AI-043) (2026-06-15)

A second admin-triggered, **in-process** crew path — this one for the **SEO Backfill** system (per-entity, per-field). Same shape as AI-042: it runs the AI-041 specialists (researcher → drafter → critic → editor) over `ILlmService` + the AI-040 `CrewOrchestrator` to generate ONE SEO **prose** field. **Why a new path, not a swap**: the legacy `seo-backfill-poll.sh` + `seo-backfill-generate.sh` Claude-CLI poller (and the `/internal/seo/*` endpoints) is the production SEO backfill pipeline — it works, it's the default, and it stays **fully intact and untouched**. This is the *observable* alternative: traced gateway, `agent_run` transcript, fail-closed critic. **v1 scope: prose-only — `Edition.Description` + `Author.Bio`** (Genre/Relevance/Themes/Faqs/SeoTitle/SeoDescription stay legacy). **No DB migration.**

- **DRY extraction (refactor of AI-042)** — the per-field crew machinery is pulled out of `AutoPublishCrew` into a new shared **`Application/Agents/FieldCrew.cs`** (scoped): the `FieldCrewState`, the 4-stage `CrewPlan` builder (researcher → drafter → critic → editor folds), the fail-closed `NeedsReview` gate, the shared `FieldResult` record, and the `CrewRunRecordFactory` → `IAgentRunWriter` persistence. `FieldCrew.RunFieldAsync(crewName, goal, costCapUsd, brief, source, ctx, ct)` parameterizes the crew name (→ agent `crew.{crewName}`), the run goal and the cost cap, so the SAME runner drives both crews. **`AutoPublishCrew` is now a thin wrapper** over `FieldCrew` (`crewName="autopublish"`, `goal="edition.{field}"`, cap `0.02m`) that maps `FieldResult` → the unchanged `AutoPublishFieldResult` and keeps the static `NeedsReview` gate — so the AI-042 endpoint and all its tests stay GREEN with zero churn. The superlative blocklist moved to a shared **`CrewBannedPhrases`** constant (`AutoPublishBriefs` + `SeoBriefs` both reference it).
- **`Application/Agents/SeoBriefs.cs`** (new, pure) — `static ContentBrief For(entityType, fieldName, lang)` keyed on `(entity, field)`: `edition/description` 800-1600 chars, `author/bio` 600-1400; `BannedPhrases = CrewBannedPhrases.List`; `StyleGuide` is a SHORT **distilled** per-field constant (factual / encyclopedic / third-person) — deliberately **not** the raw `SeoTemplate.PromptTemplate`, which carries `{{placeholders}}` + JSON-output instructions that would corrupt the prose specialists. Unsupported pairs throw (endpoint 400s).
- **`Application/Agents/SeoCrew.cs`** (new, scoped) — thin wrapper over `FieldCrew` (`crewName="seo"`, `goal="{entityType}.{fieldName}"`, cap `0.02m`). DB-free core: never reads or writes an entity.
- **`Application/Seo/SeoJobProcessor.cs`** — new `ApplyCrewResultAsync(jobId, editedText, anyNeedsReview, sourceInsufficient, ct)` mirroring the existing `ApplyAsync` but taking already-final PROSE per field + the crew gate flag instead of raw Claude JSON. **Reuses the same trust/snapshot/apply path**: strictest-wins `EffectiveTrust` (extracted as a pure static, now shared with `ApplyAsync`), Before/After snapshots, `SeoContentApplier.ApplyAsync` (→ `SeoSource.Auto`, SSG enqueue). The park decision is the **strictest-of** four gates: `CrewResultRequiresReview` (pure static — `anyNeedsReview` **fail-closed, overrides trust**, then `requireReview` / non-Auto-trust), the **P2 source-material floor** (`sourceInsufficient`), and **P1#2 manual-source protection** loaded from the LIVE entity. So revert / audit / trust-gate / SSG behave identically to the legacy path. **QA fixes (post-review):** (a) **Queued→Running transition** — added `MarkRunningAsync(jobId)` (targeted raw `UPDATE … SET status=Running, started_at=now() WHERE id=@id AND status=Queued`, mirroring `ClaimNextAsync`); the crew endpoint enqueues then runs its OWN job synchronously, so it can't use `ClaimNextAsync` (which claims an arbitrary job) — without this, `GetContextAsync`'s Running-assert threw on every call after 4 LLM calls and wedged the job Queued. (b) **Manual-source protection** — new pure `IsManualProtected(currentSource, currentFieldContent)` (mirrors AI-042's contract) + `SeoContentApplier.ReadCurrentAsync` to load the entity's live `SeoSource` + field content; a Trust=Auto template can no longer clobber a hand-written `Manual` field (parks `NeedsReview`, writes nothing, `Error=manual_protected`). (c) **Source-material floor** — new pure `IsSourceMaterialInsufficient` + `const MinSourceMaterialChars = 200`: empty/below-threshold source forces `NeedsReview` (`Error=insufficient_source`) so an empty-context Edition can't auto-apply a hallucination.
- **`Api/Endpoints/AdminSeoBackfillEndpoints.cs`** — new `POST /admin/seo/{entityType}/{entityId}/crew-generate` (same `/admin/*` auth group, new `seo.crew` rate-limit policy). Validates `entityType ∈ {edition, author}` → maps to the in-scope field (edition→description, author→bio). Resolves the entity via `SeoContextBuilder.BuildAsync` (404 if missing), **sanitizes EVERY value** with `SeoPromptSanitizer.Sanitize` before flattening to source material, builds the brief via `SeoBriefs.For`, runs `SeoCrew.RunFieldAsync`, then **routes the result through the `SeoBackfillJob` apply path** (`EnqueueAsync` resolves + freezes the active template ids/versions for trust → `MarkRunningAsync` transitions THIS job Queued→Running → `GetContextAsync` snapshots Before → `ApplyCrewResultAsync`). The crew+apply flow is wrapped so a mid-run exception marks the job **Failed** via `FailAsync` (never left Running/Queued — which would wedge the entity via the dedup guard). **P2 floor** computed here from the sanitized source and threaded into `ApplyCrewResultAsync`. **P3 fix:** `AgentContext.EditionId` is the edition slot only (→ `agent_run.edition_id`, no FK) — for author runs we now pass `EditionId = null` so an author id is never stored in an edition-named column; the run cross-links to the entity via the `SeoBackfillJob` (entityType+entityId) + runId. Returns runId, jobId, crew/apply status, `needsReview`/`applied`, and a critique-score summary.
- **DI / config** — `FieldCrew` + `SeoCrew` registered scoped next to `AutoPublishCrew` in `Program.cs`; `seo.crew` rate-limit policy (4/min per IP) mirrors `autopublish.crew`. **No DB migration** — reuses the Phase 6 `agent_run` table and the existing `SeoBackfillJob` columns.
- Tests: `SeoCrewTests` (fake `ILlmService` routed per `FeatureTag` + recording `IAgentRunWriter`, no network/DB) — clean → not flagged + edited text; critic `blocker` → flagged; garbage critic → parser fail-closed; empty / below-`MinLength` editor output → flagged; per-field cost cap → `budget_exhausted` + flagged + partial run; persists once as `crew.seo` with the entity slot set + 4 nested sub-agent steps (edition `edition.description` + author `author.bio` goals). `SeoJobProcessorCrewDecisionTests` — pure `EffectiveTrust` (strictest-wins, empty→Review) + `CrewResultRequiresReview` (crew flag overrides Auto trust; clean+Auto→apply; non-Auto / requireReview → review) + **P1#2 `IsManualProtected`** (Manual+filled→protected; Manual+empty→eligible; Auto/Hybrid+content→eligible) + **P2 `IsSourceMaterialInsufficient`** (empty/below-200-char→true; at/above floor→false). The Queued→Running raw-SQL transition is covered by the existing integration harness / manual verification (no EF-InMemory provider in the repo; the apply DECISION logic is fully unit-covered via the extracted pure helpers). `SeoBriefsTests` — bounds per (entity, field), shared banned list, distilled (not raw-template) StyleGuide, target language, case-insensitivity, unsupported-pair throws. The AI-042 `AutoPublishCrewTests` + `AutoPublishManualProtectionTests` and the StudyBuddy tool set-equality test all stay GREEN after the refactor; no `ITool` introduced.

### Phase 7 — in-process AutoPublishCrew admin path (AI-042) (2026-06-15)

An admin-triggered, **in-process** path that runs the AI-041 specialists over `ILlmService` + the AI-040 `CrewOrchestrator` to generate SEO **prose** for an Edition (`Description` + `SeoRelevanceText`). **Why a new path, not a swap**: the legacy bash + Claude-CLI systemd poller (`seo-publish-poll.sh`/`seo-generate.sh`) is the production SEO pipeline — it works, it's the default, and it stays **fully intact and untouched**. This is the *observable* alternative: every call routes through the traced gateway (`llm_traces`), persists as an `agent_run` with the full sub-agent transcript (AI-045 replay), and is gated by a fail-closed critic — none of which the opaque CLI poller offers. Shipping it parallel (not as a replacement) lets us prove the crew on real editions with zero risk to the live poller, exactly as `AgentLoop` shipped before any caller migrated.

- **`Application/Agents/AutoPublishBriefs.cs`** (new) — static factory for the two `ContentBrief`s: `Description("en")` (800-1600 chars) + `Relevance("en")` (500-1000). Shared hardcoded `BannedPhrases` ("masterpiece", "must-read", "timeless classic", "page-turner", "tour de force", "magnum opus") and `StyleGuide` ("Factual, encyclopedic tone; no subjective superlatives; third person.") — encodes the legacy "no subjective superlatives" rule as a list the critic can actually score against. Admin-editable later.
- **`Application/Agents/AutoPublishCrew.cs`** (new, scoped) — DB-free service: builds a 4-stage sequential `CrewPlan` (researcher → drafter → critic → editor via `CrewTasks.Of`), runs it under `CrewOptions(CostCapUsd: 0.02m, MaxParallelism: 1)`, persists via `CrewRunRecordFactory` → `IAgentRunWriter` (agent `crew.autopublish`, goal `edition.{field}`), and returns an `AutoPublishFieldResult` (edited text + critique + fail-closed `NeedsReview` + status + runId). **Writes nothing to the Edition and never publishes** — the caller owns apply/publish. The `NeedsReview` gate is a pure, unit-tested static: `true` unless the crew COMPLETED **and** the editor's text clears the brief's `MinLength` floor **and** the critic produced a parseable verdict **and** that verdict raised no `blocker` (so an error/budget halt, **empty/whitespace/below-floor edited text**, a missing/unparseable critic, or any blocker all fail closed). The **empty-output floor** (`NeedsReview(status, critique, editedText, minLength)`) closes the P1 data-loss hole where an editor returning `""` with a clean critic would otherwise read as a clean pass and let the endpoint overwrite a real field with an empty string. Per-field cost cap is a `const decimal CostCapUsd = 0.02m`.
- **`Api/Endpoints/AdminAutoPublishEndpoints.cs`** — new `POST /admin/autopublish/editions/{editionId}/crew-generate` (same `/admin/*` auth group, new `autopublish.crew` rate-limit policy). Loads the same source material `seo-generate.sh` feeds Claude (title, author(s), language, `LEFT(plain_text, 1000)` of the first chapter), runs the crew TWICE (Description + Relevance, separate runIds). **Gate**: if EITHER field needs review → writes nothing, returns `{ needsReview: true, runIds, fields }` with per-field critique-score summaries; if BOTH clean → writes `Description` + `SeoRelevanceText`, sets `SeoSource = Auto`, saves. **Manual-source protection (P2)**: before the write block, `IsManualProtected(edition.SeoSource, Description, SeoRelevanceText)` (pure helper) blocks the write entirely when the edition is `SeoSource.Manual` **and** either targeted field already holds hand-written content — the response carries `manualProtected: true` so the admin sees why, the Edition (and its `SeoSource`) stays untouched, and only the crew transcripts persist (audit). Honors the same "Manual flag protects filled content from overwrite" contract as the legacy `SeoCoverageAnalyzer`. Empty Manual fields are still fair game for first-time generation. Edition stays `Draft` regardless. Response carries both runIds for the AI-045 transcript UI.
- **DI / config** — `AutoPublishCrew` registered scoped (it persists via the scoped `IAgentRunWriter`) next to the specialists in `Program.cs`; `autopublish.crew` rate-limit policy (4/min per IP — a generate is 8 LLM calls) mirrors the `studybuddy` policy shape. **No DB migration** — reuses the Phase 6 `agent_run` table and the existing Edition columns.
- Tests: `AutoPublishCrewTests` + `AutoPublishManualProtectionTests` (fake `ILlmService` routed per `FeatureTag` + recording `IAgentRunWriter`, no network/DB) — clean critic → not flagged + edited text; critic `blocker` → flagged; garbage critic → parser fail-closed → flagged; persists exactly once as `crew.autopublish` with editionId + 4 nested sub-agent steps; per-field cost cap → `budget_exhausted` + flagged + partial run persisted (only the research stage ran); plus the `NeedsReview` gate exercised directly across completed/halted/null/parse-failed/blocker/minor-major cases. **P1 floor**: empty / whitespace-only / below-`MinLength` editor output → flagged (was a pinned `_BUG` regression, now flipped); at/above-floor + clean critic → not flagged. **P2 manual-protect**: `IsManualProtected` pure helper — `Manual` + filled Description or Relevance → blocked; `Manual` + empty fields → allowed; `Auto`/`Hybrid` with content → allowed. No `ITool` introduced — the StudyBuddy tool set-equality test is unaffected.

### Phase 7 — crew specialist sub-agents + prompts (AI-041) (2026-06-15)

The four generic, **single-call** crew specialists the content crews (AI-042/043) compose via `CrewTasks.Of` + `CrewOrchestrator` (AI-040). Each is exactly ONE `ILlmService` gateway call — no tools, no `AgentLoop`, no iteration — and is domain-agnostic (no SEO/AutoPublish specifics): they operate on a shared `ContentBrief` (length in CHARACTERS, banned phrases, target language, optional style guide). **Why these four, in this order**: a researcher condenses the source into grounded bullet FACTS; a drafter writes the field strictly from those notes; a critic scores the draft 1-5 **against the research notes** (not its own knowledge) — every claim not supported by the notes is a factual-accuracy `blocker` — and an editor rewrites fixing each issue blockers-first. Grounding the critic on the research notes is the crux: it turns "does this sound plausible?" into "is this actually in the source?", which is what catches hallucinations the drafter slipped in.

- **`Application/Agents/CrewAgentContracts.cs`** (new) — the records threaded through a crew: `ContentBrief`, `ResearchInput`/`ResearchNotes`, `DraftInput`/`Draft`, `CritiqueInput`/`EditInput`, `CritiqueResult` (four 1-5 scores + `Issues` + `ParseFailed`), `CritiqueIssue` (severity `blocker|major|minor`). All read the same brief so "write to N chars" and "score length against N" can never drift.
- **`Application/Agents/SingleCallAgent.cs`** (new, abstract) — base for a one-gateway-call `IAgent<TIn,TOut>`: subclasses own only `FeatureTag` (routing), `MaxOutputTokens`, `BuildPrompt`, `Parse`; the base does the request/timing/step/usage plumbing so each specialist is ~15 lines. Produces the same shape the orchestrator schedules — one `"llm_response"` `AgentStep` + `AgentUsage(Iterations: 1, …)` mapped from the gateway's `LlmUsage`.
- **`ResearcherAgent` / `DrafterAgent` / `CriticAgent` / `EditorAgent`** (new) — feature tags `crew.researcher` / `crew.drafter` / `crew.critic` / `crew.editor`; token budgets 600/500/700/500. Researcher/drafter/editor parse = trimmed text; critic parses via `CriticOutputParser`.
- **`Application/Agents/CriticOutputParser.cs`** (new, pure) — strips ```` ```json ````/```` ``` ```` fences, slices first `{` to last `}`, deserializes case-insensitively into a private DTO matching the prompt's schema, clamps each score to [1,5], coerces unknown/blank severity → `minor`, drops issues with no fix. **Fail-closed**: any exception / empty / no-brace → `CritiqueResult(1,1,1,1, [blocker "unparseable"], ParseFailed: true)` and NEVER throws — an unreadable critic must read as "reject", never as a silent clean pass.
- **`Application/Agents/Prompts/`** (new dir) — `ResearcherPrompt`/`DrafterPrompt`/`CriticPrompt`/`EditorPrompt` (pure `BuildSystemPrompt`/`BuildUserPrompt`, mirroring `ExplainPrompt`) + an internal `BriefConstraints` so drafter/critic/editor render length + banned phrases IDENTICALLY. `CriticPrompt` inlines the literal JSON schema it shares with the parser and demands a bare JSON object only.
- **DI** — the four registered as singletons next to `StudyBuddyAgent` in `Api/Program.cs` (stateless, take the singleton `ILlmService`).
- Tests: `CrewSpecialistsTests` (23, fake `ILlmService`, no key/network) — each agent maps its canned response to the typed output with one `llm_response` step + `Iterations==1` + usage from `LlmUsage`; the `CriticOutputParser` battery (well-formed, fenced, trailing prose, score clamp 0→1 / 9→5, unknown severity → minor, missing-fix dropped, garbage/empty/no-brace fail-closed, never-throws sweep); prompt builders surface length range / banned phrase / language / the critic schema tokens (`factual_accuracy`, `severity`, `blocker`); and a crew integration smoke test wiring all four via `CrewTasks.Of` into a 4-stage `CrewPlan` run through the real `CrewOrchestrator` — asserts state threads research→draft→critique→edit and the transcript has 4 `CrewStepEntry`s in declaration order (proves the AI-040 contract; no stray `ITool` added).

### Phase 7 — CrewOrchestrator primitive (AI-040) (2026-06-15)

Phase 7 opens with the **generic multi-agent orchestration engine** — the crew-level analogue of `AgentLoop` (AI-034). Engine-only: no concrete crews, no specialist agents, no SEO/AutoPublish wiring, no endpoint (those are AI-041+). Like `AgentLoop` shipped before `StudyBuddyAgent`, the primitive lands first and migrates callers later. **Reuses Phase 6 seams**: no new tables, no new persistence interface — a crew run persists through the same `IAgentRunWriter`/`agent_run` path as a single agent.

- **`Ai.Core/Crew.cs`** (new, framework-free) — the contract records: `CrewTask<TState>` delegate, `CrewTaskResult`, `CrewStage<TState>` (1 task = sequential, >1 = parallel), `CrewOptions` (`CostCapUsd`, `MaxParallelism`), `CrewPlan<TState>`, `CrewStepEntry` (one sub-agent invocation in the transcript), `CrewResult<TState>`. Status strings reuse the existing `"completed" | "budget_exhausted" | "error"` constants.
- **`Ai.Agents/CrewOrchestrator.cs`** (new, singleton, stateless) — runs a plan stage by stage over a shared mutable `TState`. One-task stage → awaited directly; N-task stage → `Task.WhenAll` bounded by a `SemaphoreSlim(MaxParallelism)` (mirrors `ToolDispatcher.DispatchAllAsync`). Peer folds run + transcript appends in task **declaration** order (deterministic, never completion order). Usage is summed across every sub-agent (`Iterations` = total sub-agent invocations, latency = wall-clock). Cost cap checked **after** each stage (keep the partial transcript, don't start the next stage → `budget_exhausted`). **Fail-closed on both failure modes**: a sub-agent **error** halts the crew after recording the stage (peers already awaited → `error`, next stage skipped); a **budget-exhausted** sub-agent likewise halts the crew, but keeps the distinct `budget_exhausted` status (so it stays diagnosable in the transcript) — next stage skipped, partial transcript kept. Cancellation propagates raw — the primitive persists nothing.
- **`Ai.Agents/CrewTasks.cs`** (new) — `CrewTasks.Of<TState,TIn,TOut>(name, agent, buildInput, fold)` wraps a typed `IAgent` as a crew task: own child DI scope per task (the per-invocation-scope rule — two parallel sub-agents must not share an EF DbContext), budget-exhaustion/errors mapped to `CrewTaskResult` as DATA with a null fold (only true cancellation propagates).
- **Fold-ordering model** — flat, no DI seam: each task hands back a `CrewTaskOutcome` (its transcript result + a deferred `Fold` action). A parallel task **never** mutates the shared `TState` in its body; on success it returns its fold deferred (null on budget/error — nothing to apply). After `Task.WhenAll`, the orchestrator already holds the outcomes in **declaration** order, so it **runs the folds single-threaded, in declaration order, on its own thread** — ordered and never concurrent, regardless of which sub-agent finished first. The 1-task stage runs the identical path.
- **`Ai.Agents/CrewRunRecordFactory.cs`** (new, pure) — maps `CrewResult<TState>` → the existing `AgentRunRecord`: `Agent = "crew.{name}"`, caller-supplied `goal`/`output` (no `TState` stringify), status/error/usage straight from the result. Each `CrewStepEntry` → one `AgentStep` of kind `"sub_agent"` with the sub-agent's own transcript nested under `payload.steps` for replay.
- **DI** — `AddAiAgents()` now also `TryAddSingleton<CrewOrchestrator>()`.
- Tests: `CrewOrchestratorTests` (19, deterministic fake `IAgent`, no LLM/AgentLoop/tools) — sequential ordering + state hand-off, parallel fan-out folded in declaration order (peers finish reversed, plus a 40× random-release stress run), `MaxParallelism` bound (peak ≤ 2) + non-positive clamp, distinct per-task DI scope (and scope disposed on the throw path), post-stage cost cap (stage 2 never runs), sub-agent error fails closed (peer completes, next stage skipped), a **budget-exhausted sub-agent fails closed too** (`budget_exhausted` status, next stage skipped, partial transcript kept, fold not applied), error-vs-cap precedence, empty plan / empty stage no-ops, wall-clock latency, cancellation propagates, and `CrewRunRecordFactory` mapping + JSON round-trip (`crew.{name}`, `"sub_agent"` steps, nested transcript, aggregate usage).
- Untouched deliberately: `AgentRun.cs`, `DbAgentRunWriter.cs`, `AppDbContext.Agents.cs`, migrations, `AgentLoop.cs`. No endpoint.

### Phase 6 follow-up — deterministic tool gating for Study Buddy (AI-039) (2026-06-15)

The AI-039 eval scored judge **3.53/5** because gpt-4.1-nano **over-calls** the book tools: every golden run showed `steps=2` (a tool call, then the answer) even though the passages are self-contained — they never reference a chapter, an earlier discussion, or the reader's own highlights. Same failure mode we already fixed for Explain (AI-033): the model can't hold both directions of the tool decision at once, so the **lexical** half — does the passage even point outside itself? — moves into code, and the model only decides the (now near-trivial) remainder.

- **`Application/Ai/BookToolTriggers.cs`** (new) — shared deterministic detector. `BookToolSignal` `[Flags]` enum (ChapterNumber / EarlierReference / UserHighlights) + `Detect(text)` ORs the matched signals. Holds the three compiled regexes extracted from `ExplainToolTriggers` (compiled `Regex`, not `[GeneratedRegex]` — repo ARM64 SIGILL caveat).
- **`ExplainToolTriggers`** now delegates its lexical detection to `BookToolTriggers.Detect` (same name-mapping + `hasUser` gate, `lookup_dictionary` still excluded) — **no behavior change**, existing golden-set tests stay green unchanged.
- **`StudyBuddyAgent`** — the static `AllowedTools` field becomes a **per-run `ResolveTools(input, ctx)`**: which tools are OFFERED depends ONLY on the passage's wording. Self-contained passage → **no tools** (answers in one step, no tool noise); `Chapter N` → `get_chapter` + `get_chapter_summary`; "discussed earlier" → `search_book` + `find_earlier_definition`; "my highlights/notes" **and** a signed-in user → `get_user_highlights` + `get_user_vocabulary`. `BuildGoal` still runs on the passage/chapter; `Detect` runs only on `input.Passage` (not the built goal). `SystemPrompt` tightened to mirror Explain v3: a term being technical/unfamiliar is **never** itself a reason to call a tool.
- **`StudyBuddyEvalRunner`** — `StudyBuddyCase` gains `OfferedTools` (count of tools the gate offered for that passage), surfaced via the admin eval endpoint, so the discipline is visible per case before a prod re-run (a self-contained passage should show 0).
- Tests: `BookToolTriggersTests` (every Study Buddy golden passage → `None`; positive/combined/plain cases) and `StudyBuddyAgentTests` extended with `ResolveTools` behaviour (self-contained → request `Tools` null; `Chapter 5` → chapter tools; user tools absent when `ctx.UserId == null`).
- **QA P3 — tightened `EarlierReference` detection**: the old "discuss-verb `[^.!?]*` temporal-token" gap matched anywhere in a sentence and false-positived on self-contained sentences where a high-frequency verb merely co-occurred with "earlier"/"previously" (e.g. *"Earlier adopters … covered their bets"*, *"The earlier benchmark mentioned a slow node"*, *"I covered the topic earlier today"*) — over-offering `search_book` / `find_earlier_definition` and nudging `steps` up, the exact metric AI-039 targets. Now the verb and temporal token must be **adjacent**: `discussed|mentioned|introduced|touched on` within ≤3 words of `earlier|before|previously`; bare `covered|saw` only when **immediately** adjacent; the reverse order only across a **pronoun** (*"earlier we discussed"*), not a noun phrase; plus the explicit *"earlier in this book/chapter"* anchor. All real signals still match (*"as we discussed earlier"*, *"mentioned before"*, *"covered earlier"*, *"Earlier we discussed split brain"*, *"touched on skew earlier"*); 3 FP-guard cases added to `BookToolTriggersTests`. All 10 Study Buddy goldens still → `None`; Explain goldens/eval unchanged.

### Phase 6 — Study Buddy golden set + eval — Phase 6 complete (2026-06-15)

Phase 6 **AI-039** — the DoD gate for the Study Buddy agent (judge ≥4/5, avg steps ≤4, cost <$0.05). **This closes Phase 6** (agent loop → tools → persistence → SSE endpoint → reader UI → eval).

- **`StudyBuddyEvalRunner`** (`Ai.EvalSuite`) — per golden: run the REAL agent against a real edition (its tools hit the live corpus), score the final answer against the reference with the same MEAI `RubricEvaluator` the suite uses (correctness / grounding / clarity), and record iterations + cost. A budget-exhausted run is a failed case (judge 0, capped steps). Persists a `studybuddy` `EvalRun` (judge mean 1–5; avg steps + cost in the breakdown).
- **Golden set** `studybuddy.json` (embedded) — 10 starter DDIA "confusing passage → reference explanation" cases; a **starter to curate to the DoD's 25** against the live edition (align chapter numbers to it).
- **`POST /admin/ai-quality/evals/studybuddy/run?editionId=&judge=`** — admin-triggered against a real embedded edition (503 when the judge isn't configured). The agent's tools resolve scoped services from the request scope.
- Tests: `StudyBuddyEvalRunner` with a direct-answering fake agent + fixed judge — scores the whole golden set, aggregates the judge mean, and computes avg steps (1.0) + cost deterministically. Golden count read from the dataset so it survives growth to 25.

### Phase 6 — Study Buddy wired into the reader (2026-06-15)

Phase 6 **AI-038, slice b** — the panel is now reachable: select a passage in the reader → "Help me understand this" → the agent investigates live.

- **`SelectionToolbar`** gains a **"Help me understand this"** action (sparkles icon) next to Explain, shown only when `onStudyBuddy` is wired (catalog editions).
- **`ReaderHighlights`** passes the whole selected passage up via a new `onStudyBuddy(passage)` prop and clears the selection.
- **`ReaderPage`** holds the passage state and renders `StudyBuddyPanel` (catalog editions only, like Ask), threading the **current chapter number** so the agent's chapter tools have context. Opening it for a new passage re-runs.
- i18n: `reader.selectionToolbar.studyBuddy`.
- Verified: `tsc` + `pnpm build` clean; full web suite green (517); no e2e clicks the selection toolbar positionally (no index drift). The live agent run is exercised on prod (key + corpus).

### Phase 6 — Study Buddy web panel (2026-06-15)

Phase 6 **AI-038, slice a** — the web UI for the agent: an `api` client, a streaming hook, and the panel. Wiring it into the reader's selection toolbar is slice b.

- **`api/studybuddy.ts`** — `runStudyBuddy(editionId, passage, chapter, callbacks)` consumes the AI-037 SSE (`step`/`done`/`error`) via `postSse`; `getStudyBuddyRun(runId)` fetches a persisted run for the "show steps" view.
- **`useStudyBuddy` hook** — `steps` grow live as the agent works, `answer` lands on `done`, `status` (idle/running/done/error); a new run aborts the in-flight one; 401 surfaces as `error: 'auth'` for a sign-in prompt.
- **`StudyBuddyPanel`** — right slide-in panel (mirrors `AskPanel`): the passage echoed at the top, the final answer, a spinner while running, and a **collapsible step transcript** (each step summarized: tool name + ok/✗, or the model's text/`Looking up: …`). Auth-gated.
- **`lib/sse.ts`** — `postSse` now sends `credentials: 'include'` (needed for the authed Study Buddy stream; harmless for the public Explain one) and maps 401 → new `SseUnauthorizedError`.
- Tests: `useStudyBuddy` (step accumulation → answer on done; terminal error keeps partial steps; 401 → auth; no-op on empty/missing; reset); `postSse` 401 → `SseUnauthorizedError` + credentials sent. Web suite green (517); `tsc` + build clean.

### Phase 6 — Study Buddy endpoint (SSE + run history) (2026-06-15)

Phase 6 **AI-037, slice b** — the reader can now run the agent and watch it work. The panel UI is AI-038.

- **`POST /me/books/{editionId}/studybuddy`** — authenticated; runs `StudyBuddyAgent` on a highlighted passage and streams its progress over SSE: a **`step`** event per recorded step (index / kind / payload), a **`done`** event with the final answer (+ iterations + cost), or a terminal **`error`** event when the agent fails or exhausts its budget. The run is **persisted** (AI-036) on completion with the right status — a budget-exhausted run keeps its partial transcript. `X-Accel-Buffering: no` for the Cloudflare tunnel; client disconnect propagates untraced; rate-limited (`studybuddy`, 8/min/IP — runs are several LLM calls each).
- **`GET /me/studybuddy/runs/{runId}`** — returns a persisted run (scoped to the user) with its step transcript parsed from jsonb, for the "show steps" view.
- Tests: `StreamRunAsync` over the real agent + loop + scripted LLM — direct answer → `step`→`done` + a persisted `completed` run; never-terminating model → partial `step`s → terminal `error` + a persisted `budget_exhausted` run that keeps its transcript. Live-API integration (skip-friendly): no-auth → 401, empty passage → 400, unknown run → 404.

### Phase 6 — streaming agent loop (2026-06-14)

Phase 6 **AI-037, slice a** — the loop streams its steps so the reader can watch the agent work. The SSE endpoint + run persistence + `GET` are slice b.

- **`AgentLoop.StreamAsync`** — yields an `AgentEvent` per step as it happens (`llm_response` / `tool_result`), then a terminal Done event carrying the final `AgentResult`. `RunAsync` is now built on top of it (collects to the Done result), so non-streaming callers (the AI-039 eval) are unchanged — behaviour identical, budget exhaustion still throws with its transcript after the partial steps have streamed.
- **`AgentEvent`** (`Ai.Agents`) — a step-or-result union (`OfStep`/`Done`).
- **`StudyBuddyAgent.StreamAsync`** — same prompt/tools/budget as `RunAsync`, streamed; both share one `BuildAgentInput`.
- Tests: `AgentLoop.StreamAsync` (step events in order → terminal Done; budget exhaustion streams partial steps then throws, no Done); `StudyBuddyAgent.StreamAsync` (config threading → step + Done). Full suite green (270).

### Phase 6 — agent run persistence (2026-06-14)

Phase 6 **AI-036** — agent runs are saved so the reader UI can replay an agent's steps (AI-038) and runs are observable. Persistence mechanics only; the endpoint that calls it is AI-037.

- **`agent_run` table** (`AddAgentRun` migration) + `AgentRun` entity + `DbSet` on `IAppDbContext`/`AppDbContext` (`AppDbContext.Agents.cs`). Columns: agent / user / edition / goal / status / output / **`steps_json` (jsonb)** / iterations / tokens / cost / latency / error / created_at. Optional FK→users `ON DELETE SET NULL` (a deleted user doesn't erase history); partial index on `(user_id, created_at)`.
- **`IAgentRunWriter`** (`Ai.Core`) + **`DbAgentRunWriter`** (`Application/Ai`, scoped, mirrors `DbLlmTraceWriter`): flattens the framework-free `AgentRunRecord` into the entity, serializing the step transcript to jsonb. Awaited by the caller (the run is already finished — no latency to hide).
- **`AgentRunRecord` + `AgentRunRecordFactory`** (`Ai.Core` / `Ai.Agents`): `Completed` / `BudgetExhausted` / `Failed` build a persistable record uniformly across outcomes.
- **Budget-exhausted runs keep their transcript**: `AgentBudgetExhaustedException` now carries the partial `Steps` + `Usage` accumulated before the cap (the run you most want to inspect is the one that ran out of budget); `AgentLoop` throws with them at both the cost-cap and max-steps exits.
- Tests: `AgentRunRecordFactory` (completed/budget-exhausted-keeps-transcript/failed); `AgentLoop` budget exhaustion now asserts the exception carries the partial transcript + usage. Migration applied locally + jsonb roundtrip/FK/index verified on Postgres.

### Phase 6 — cleanup: shared spoiler-gate resolver + robust tool-set test (AI-035 follow-up, 2026-06-14)

Audit follow-up to AI-035 — clean-architecture tidy, no behaviour change.

- **DRY:** the high-water-mark spoiler-gate resolver (`ResolveLastReadOrdAsync`) was copy-pasted verbatim in `SearchBookTool` and `FindEarlierDefinitionTool`. Extracted to a single `ReadingProgressGate` helper (Application/Tools); both tools call it. (`RagContextService` keeps its own variant — it additionally filters by SiteId for the authenticated RAG path; the difference is now documented in one place.) Orphaned `Microsoft.EntityFrameworkCore` usings removed with the local copies.
- **Test robustness:** the tool-discovery assertion drifted on a magic count (broke at 4→7) and was split across files. Now one canonical allow-list in `StudyBuddyToolsTests` asserted by **set-equality** against the registry — a missing OR stray tool fails with a readable diff, and adding a tool is a deliberate one-line edit in one place. The duplicate count assertion was already removed from `StarterToolsTests`.

### Phase 6 — Study Buddy agent + 3 tools (2026-06-13)

Phase 6 **AI-035** — the concrete agent on top of the AI-034 loop, plus the three tools it needs. The reader endpoint + SSE step events are AI-037; persistence is AI-036.

- **`StudyBuddyAgent`** (`Application/Agents`, implements `IAgent<StudyBuddyInput, string>`) — a thin layer over `AgentLoop`: owns only the system prompt, the allowed tool set (the new trio + `get_chapter`/`get_chapter_summary`/`search_book`/`get_user_highlights`), and the run budget (≤6 steps, per-step token cap, **$0.05 cost cap**). Goal is built from the highlighted passage + chapter. System prompt: investigate with tools, write a grounded 3–5 sentence explanation, never invent facts.
- **3 new tools** (`Application/Tools/`, stateless singletons, scoped deps via `ToolContext`):
  - `find_earlier_definition(term)` — where a concept was first introduced earlier in the book (lowest-numbered chapter that matches, via the AI-023 hybrid retrieval; spoiler-gated to the reader's progress).
  - `get_chapter_summary(chapter_number)` — a cheap deterministic orientation (title + word count + opening 800 chars), so the agent can scope a chapter without pulling it in full.
  - `get_user_vocabulary(query?, limit?)` — the user's own saved words (+definition/translation) for the book, so explanations connect to terms they're already learning.
- Tests: `StudyBuddyAgent` wiring over the real loop + fake LLM (prompt/feature-tag/goal threading, chapter in/out of goal); the three tools' schema validity (happy path / malformed / unknown-prop) and that the assembly scan now finds exactly the 7 Application tools. DB/RAG behaviour exercises in AI-037 + e2e.

### Phase 6 — agent loop engine (2026-06-13)

Phase 6 **AI-034** — the hand-rolled plan→act→observe loop every agent runs on. Engine only; the concrete Study Buddy agent + its tools are AI-035.

- **New project `TextStack.Ai.Agents`** + **`AgentLoop`**: each iteration asks the model with the agent's allowed tool schemas; no tool call → that's the final answer; otherwise dispatch the requested tools (via the Phase 5 `ToolDispatcher` — validated, parallel, failures returned as data so the agent recovers instead of throwing) and feed results back. The assistant tool-call turn is threaded before the tool results (OpenAI ordering). Every turn is recorded as an `AgentStep` for a transparent, persistable transcript; `AgentResult` carries the output + steps + accumulated `AgentUsage`.
- **Bounded two ways**: a hard `MaxSteps` cap and an optional cumulative `CostCapUsd` — exhausting either throws `AgentBudgetExhaustedException` (can't loop forever / burn budget). `AgentLoopOptions` passed per-run, so one engine serves agents with different caps.
- Reuses the `Ai.Core` agent contracts that shipped in Phase 2 (`AgentStep`/`AgentResult`/`AgentContext`/`AgentUsage`/`AgentInput`/`AgentLoopOptions`). Registered via `AddAiAgents()` (singleton; per-run state on the stack, scoped tool services via `AgentContext.Services`).
- Tests (6, scripted LLM): direct answer (1 iteration); tool round → answer (message threading + step kinds `llm_response`/`tool_result`/`llm_response`); usage accumulates across iterations; MaxSteps without a final answer throws; cost cap trips mid-run; unknown tool fed back as data and the loop recovers.

### Phase 5 — deterministic tool pre-router (AI-033 follow-up 4, 2026-06-12)

Eval history: 0.33 → 0.50 → 0.73 → **0.53**. The v3 ALWAYS-trigger prompt made the trigger goldens near-perfect (chapter 8/8, search 4/5, highlights 2/2) but re-infected the no-tool side (2/15) — nano demonstrably can't hold both directions of the decision in-prompt; every iteration sacrificed one side.

- **The IF moves into code** (`ExplainToolTriggers`, Application/Ai, pure): compiled regexes detect the lexical signals — chapter number / "discussed-mentioned-covered … earlier-before-previously" / "my highlights-notes". **No signal → the request carries no tool schemas at all** (the model physically cannot over-call; the common case also skips the tool-guidance prompt and stays a plain streamed explain). Signal → only the matching tool(s) ride along, and the v3 prompt steers the now near-trivial choice.
- `ExplainEndpoints.ResolveTools` and `ToolCallEvalRunner` both route through the same triggers — the eval gate measures the production **pipeline**, not the bare model.
- **CI now guarantees the deterministic half of the gate**: `ExplainToolTriggersTests` runs the pre-router over the ENTIRE golden set — every no-tool golden triggers nothing (15/15 floor by construction), every tool golden triggers its expected tool; highlights requires a signed-in user; near-miss sentences ("a long chapter", "earlier adopters") trigger nothing.
- Re-run on prod after deploy: expected ≥0.9 (model only decides the remaining offered-tool → right-args step, which it did at 14/15 in run 4).

### Phase 5 — lexical tool triggers in Explain prompt (AI-033 follow-up 3, 2026-06-12)

Third eval iteration (0.33 → 0.50 → **0.73**). Dropping the dictionary fixed over-calling completely (no-tool 15/15), but the "RARELY needed" framing over-corrected into **under-calling**: `search_book` 1/5, `get_chapter` 5/8 — nano now answered directly even when the sentence said "as we discussed earlier" or named a chapter.

- **Prompt v3**: each tool keyed to an explicit **lexical trigger in the sentence** with imperative ALWAYS — chapter number → `get_chapter`; "earlier/before/previously" without a number → `search_book`; user mentions own highlights/notes → `get_user_highlights` — plus the rule that tool choice depends only on the sentence's wording, never on the word itself, and the no-signal → no-tool default.
- Re-run on prod after deploy: need 27/30 (≥0.9); have 22.

### Phase 5 — drop lookup_dictionary from Explain (AI-033 follow-up 2, 2026-06-12)

Second eval iteration. Prompt tightening moved accuracy 0.33 → **0.50**, but per-case output showed the same single attractor: nano still reached for `lookup_dictionary` on technical words (10 of 15 misses). Rather than keep fighting the model's prior, the tool is **removed from the Explain set** (product call, not just an eval dodge: a dictionary inside an explainer is circular for the technical-reader audience — the same reasoning mobile used when it dropped the dictionary from its reader; the tool stays in the registry for agents/MCP).

- `ExplainEndpoints.ResolveTools`: book in context → `get_chapter`/`search_book` (+`get_user_highlights` signed-in); **no book → no tools at all** (plain streaming explain).
- `ExplainPrompt`: dictionary bullet removed; "words never need a tool by themselves" added.
- Eval updated: runner offers the 3 Explain tools; the 3 dictionary goldens re-labelled no-tool (now 15 no-tool / 8 chapter / 5 search / 2 highlights).
- Re-run on prod after deploy targets ≥0.9.

### Phase 5 — prompt tuning: stop over-eager tool calls (AI-033 follow-up, 2026-06-12)

First prod run of the AI-033 tool-call eval scored **0.33** (10/30): gpt-4.1-nano called `lookup_dictionary` on **every** word — all 12 no-tool goldens failed, and half the chapter goldens were swallowed by the dictionary too. The original playbook guidance ("the word has a precise dictionary meaning relevant to the explanation") reads as "always" to nano.

- **`ExplainPrompt` tool-guidance rewritten**: tools framed as the exception ("RARELY needed"), an explicit default ("answer directly with NO tool call"), technical terms named as never needing a tool, each tool gated on an *explicit* textual trigger (numbered chapter / "discussed earlier" / user mentions own highlights / rare-archaic word), and a closing "if none apply, do NOT call any tool".
- The eval gate did exactly its job: deterministic per-case output made the failure mode obvious in one read. Re-run on prod after deploy targets ≥0.9.

### Phase 5 — tool-call golden set + eval — Phase 5 complete (2026-06-12)

Phase 5 **AI-033** — the last DoD metric: tool-call accuracy ≥0.9 on a 30-example set (right tool, right args). **This closes Phase 5** (streaming + function-calling: token streams end-to-end, 4 validated tools, visible web streaming, eval gate).

- **`ToolCallMetrics`** (`Ai.Tools`, pure) — `IsHit`: expected tool must be among the round-1 calls with every expected argument fragment present (case-insensitive substring — args are model-phrased); a **no-tool golden passes only when nothing was called** (over-calling is as much a failure as under-calling); extra parallel calls don't fail a case. `Accuracy` over the set. CI-tested.
- **Golden set** `toolcalls.json` (embedded, 30 cases): 12 no-tool (plain technical words), 8 `get_chapter` ("see Chapter N"), 5 `search_book` ("as we discussed earlier"), 3 `lookup_dictionary` (precise-meaning words), 2 `get_user_highlights` (user references own notes).
- **`ToolCallEvalRunner`** (`Ai.EvalSuite`) — per golden: the REAL Explain round-1 (production `ExplainPrompt` with tool guidance + the registry's schemas) → score the model's tool choice. Round-1 only: tools are never executed → no edition/user needed, one nano call per case. Persists `explain.toolcall` `EvalRun` (score 0–1).
- **`POST /admin/ai-quality/evals/toolcalls/run`** — sync admin trigger (~30 nano calls), 503 when keyless; per-case expected/actual detail in the response.
- Tests: `ToolCallMetrics` (11 — no-tool both ways, right/wrong/missing tool, extra parallel call, string + number fragments, missing arg, accuracy math); `ToolCallEvalRunner` with an oracle LLM (accuracy 1.0; every request carries the 4 schemas + tool-guidance prompt) and an over-eager dictionary-happy LLM (only dictionary goldens hit; no-tool goldens all miss); dataset shape guard (≥30, all tools represented).

### Phase 5 — fix: prod streaming failure with tools (2026-06-12)

Prod verification of the Explain SSE path caught a real failure: with tools attached, the **streamed** OpenAI call died before the first token — the trace (admin /ai-quality, error always sampled) showed `Value cannot be null. (Parameter 'bytes')` from inside the SDK streaming path, while the one-shot JSON path worked. Three-part fix:

- **OpenAI SDK 2.2.0 → 2.10.0** — picks up the upstream streaming/tool-call fixes between 2.2 and 2.10 (likely root cause). Full solution + suites green on the new SDK.
- **Defensive fragment accumulation** — guard `FunctionArgumentsUpdate.ToMemory().IsEmpty` before `ToString()` (same check the SDK's own streaming example uses): the first id+name chunk can carry an empty/degenerate arguments payload.
- **The swallowed stream exception is now logged** — `StreamEventsAsync` gains an `onException` hook wired to `logger.LogError`, so the next mid-stream failure leaves a stack trace, not just the trace row's message (this gap is what made diagnosis indirect).
- Verified during the same pass: SSE through Cloudflare works (correct `text/event-stream`, terminal `error` event, no aborted stream — the AI-031a hardening did its job); JSON path + cache behave on prod.

### Phase 5 — web Explain streams visibly (2026-06-12)

Phase 5 **AI-032** — the web reader renders explanations token-by-token (perceived latency drops to first-token time).

- **`lib/sse.ts`** — SSE over POST (EventSource can't send a body): a minimal, spec-subset SSE parser (`event`/`data`, multi-line data, CRLF-tolerant, comment/keep-alive lines ignored, arbitrary chunk boundaries) + `postSse()` fetch-stream consumer. Non-OK statuses (429/503/504 are JSON, not SSE) map to readable errors **before** streaming; `SseUnsupportedError` signals environments without a readable body so callers can fall back.
- **`useExplain` streams** — same external shape (consumers unchanged): `explanation` grows per delta while `isLoading` stays true until `done`; `cached` read from the done payload; a server `error` event keeps any partial text visible alongside the error. Device offline-cache still serves first; no-stream environments fall back to the one-shot JSON request. Local cache written only on a completed stream.
- **`ExplanationPopup`** — spinner only until the first token; then the text renders and grows in place with a blinking stream caret (CSS) while open.
- Tests: SSE parser (6 — dispatch, arbitrary split points, multi-line+CRLF, comments/unknown fields, trailing flush, colons in data) + `postSse` (3 — streams events, non-OK mapping, unsupported-body signal) + streaming `useExplain` (6 — delta accumulation, cached flag, server-error with partial text, JSON fallback, offline cache short-circuit, request failure). Full web suite green (511); `tsc` + build clean.

### Phase 5 — fix: per-tool DI scope + streamed tool calls traced (AI-031b follow-up, 2026-06-12)

Audit follow-up to AI-031b — one real bug, one observability gap.

- **Bug (P1): parallel dispatch shared one scoped DbContext.** `DispatchAllAsync` runs tools concurrently, but every tool resolved its scoped services (EF `DbContext`) from the same request scope — `get_chapter` + `get_user_highlights` in one tool round would throw EF's "second operation on this context". The dispatcher now creates a **fresh DI scope per invocation** (`ctx with { Services = scope.ServiceProvider }`). Test: two parallel calls observe different scoped instances.
- **Observability: streamed tool calls now land in `llm_traces.tool_calls_json`.** `TracingDecorator.StreamAsync` accumulates `ToolCallDelta`s into the trace (one-shot calls already had this), so a streamed function-calling round is inspectable on /ai-quality. Test: streamed tool call appears in the persisted trace JSON.
- Known limitation (documented, not fixed): a model that emits both round-1 text AND tool calls produces concatenated round1+round2 output for the client. Rare for nano; the shared cache is unaffected (tool-grounded answers aren't written).

### Phase 5 — function-calling: Explain can use tools (2026-06-12)

Phase 5 **AI-031, slice b** — the model can now call the AI-030 tools. Explain grounds its answers in the book (chapter fetch, in-book search, the user's highlights, dictionary) via one validated tool round.

- **`OpenAiLlmClient` function-calling** — `LlmRequest.Tools` → `ChatTool.CreateFunctionTool` (schema as-is); `CompleteAsync` parses `tool_calls` into `LlmResponse.ToolCalls`; `StreamAsync` accumulates streamed tool-call fragments per index and emits each **complete** call as a `ToolCallDelta` after the provider stream ends (partial tool-call streaming is out of Phase 5 scope). Message mapping grew the round-2 shapes: assistant turn carrying its tool calls, and `tool` role results keyed by call id. Empty content on a tool-call turn no longer warns.
- **`ToolCallingSession`** (`Ai.Tools`) — ONE round of function-calling over any `ILlmService`: stream round 1 re-yielding text (the no-tool case stays fully streaming, tool deltas are not client-visible); if tools were requested → validated parallel dispatch (`ToolDispatcher`, failures fed back as data) → round 2 **without** tool schemas streams the final answer. Multi-step loops are Phase 6's `AgentLoop`.
- **Explain wiring** — both SSE and JSON paths run through the session. Tool set per request: `lookup_dictionary` always; + `get_chapter`/`search_book` with a book in context; + `get_user_highlights` when signed in. System prompt gains the playbook tool-guidance block only when tools ride along. Kill switch: `Explain:ToolsEnabled` (default on).
- **Cache safety (QA find)** — tool-grounded answers can be user-specific (highlights; progress-gated search), so they are **never written to the shared explain cache** (`onToolRound`/`UsedTools` signal); direct answers cache as before.
- Tests: `ToolCallingSession` (6) over a scripted LLM — single-round passthrough; tool round dispatches and streams the follow-up (assistant+tool messages, no schemas in round 2, plumbing invisible to the client); unknown tool error fed back as data; complete-variant flags `UsedTools`; result serialization. Caught in-suite: duplicate fake-tool name across test classes broke the assembly-scan test — renamed (the scan's fail-fast working as intended).

### Phase 5 — Explain streams over SSE (2026-06-12)

Phase 5 **AI-031, slice a** — the Explain endpoint streams token-by-token. Function-calling wiring (tools handed to the model) is slice b.

- **Content negotiation, mobile-safe**: `Accept: text/event-stream` → SSE (`delta`* → `done` | `error`, via .NET 10 `TypedResults.ServerSentEvents`); any other request keeps the **original JSON contract** — the shared mobile client works unchanged. Web switches to the stream in AI-032.
- **Migrated off the legacy seam**: Explain now calls the `ILlmService` gateway directly (FeatureTag `explain` — routed + traced, streamed calls included per AI-028) instead of `ILlmServiceFactory`.
- **Cache preserved**: SHA256 file cache hit → one `delta` with the full text + `done(cached:true)` immediately; miss → stream, then persist the accumulated text. Empty-stream (reasoning-budget) retry preserved as a `CompleteAsync` fallback at doubled budget.
- **Robust SSE termination**: mid-stream provider failure and keyless-host provider-resolution failure both emit a terminal `error` event (never an aborted stream); client disconnect propagates untraced (AI-028 follow-up behaviour).
- **Cloudflare/nginx**: `X-Accel-Buffering: no` + `Cache-Control: no-cache` on the SSE response (playbook Phase 5 risk).
- Tests: `StreamEventsAsync` unit-tested over fake delegates (cache hit; per-fragment deltas + persist; empty→fallback delta; fallback empty/throws → error; mid-stream failure → partial deltas + terminal error, nothing persisted). Live-API integration: 400 regardless of Accept; JSON contract intact without the header; SSE content-type + guaranteed terminal event with it (skip when provider unavailable).

### Phase 5 — 4 starter tools + schema-validated dispatch (2026-06-11)

Phase 5 **AI-030** — the first concrete tools and the validated dispatch they run through. The Explain SSE refactor (AI-031) will hand these to the model.

- **`ToolDispatcher`** (`Ai.Tools`) — resolve from the registry → evaluate args against the tool's JSON Schema (**draft 2020-12 via JsonSchema.Net** — a real evaluator, not hand-rolled checks) → invoke. Unknown tool / invalid args / tool exceptions come back as failed `ToolResult`s (**errors are data** — fed back to the LLM so it can fix its args and retry, per playbook risk note). Caller-cancellation propagates untraced. `DispatchAllAsync` runs a batch concurrently (parallel tool calls, Phase 5 scope).
- **4 starter tools** (`Application/Tools/`, stateless singletons; scoped deps via `ToolContext.Services` at invoke):
  - `get_chapter(chapter_number)` — chapter title + text (4k char cap) of the context edition.
  - `search_book(query)` — top-5 passages via the production **hybrid retrieval** (AI-023); spoiler-gated to the user's furthest-read chapter when progress exists (same high-water mark as RAG), ungated otherwise (Explain targets text the user is looking at).
  - `lookup_dictionary(word, lang?)` — Free Dictionary API (same upstream as /dictionary), compacted to phonetic + top meanings; not-found is data, not an error.
  - `get_user_highlights(query?, limit?)` — the user's own highlights+notes for the book, ILIKE-filtered, capped at 20.
- All schemas declare `additionalProperties: false` — hallucinated args are caught before dispatch.
- Wired: `AddAiTools(Application assembly)` in `Program` (registry + dispatcher + scanned tools). `Microsoft.Extensions.Http` added to Application (IHttpClientFactory for the dictionary tool).
- Tests (21): dispatcher (valid → invoke; unknown tool lists available; missing-required / wrong-type / below-minimum / extra-prop all rejected pre-invoke; tool exception → failure result; batch order), every tool's schema accepts its happy path + rejects malformed & unknown props, assembly scan finds exactly the 4, `ParseEntry` compaction.

### Phase 5 — tool registry (2026-06-11)

Phase 5 **AI-029** — the shared tool catalogue (ADR-AI-005) that function-calling (AI-030/031), agents (Phase 6) and MCP all dispatch through. No tools yet (those are AI-030); this is the registry + DI wiring.

- **New project `TextStack.Ai.Tools`** — `IToolRegistry` / `ToolRegistry`: indexes the DI-registered `ITool`s by name once at construction. `Get(name)` (null when unknown), `SchemasFor(names)` (request order, de-duped, unknown skipped — feeds `LlmRequest.Tools`), `AllSchemas()`, `Names`. A blank or duplicate tool name is a wiring bug and fails fast at construction, not as a confusing "unknown tool" at dispatch.
- **`AddAiTools(params Assembly[])`** — scans assemblies for concrete `ITool` implementations and registers each as a singleton, plus the registry. Tools are singletons (stateless; per-request user/edition/scoped-services arrive via `ToolContext` at invoke time, so no captive dependency). Idempotent via `TryAddEnumerable` (de-dups by impl type).
- Tests: `Get` by name / null / case-sensitive; duplicate + blank name throw; `SchemasFor` filter/dedup/order; `AllSchemas`/`Names`; assembly scan discovers + DI-constructs concrete tools; calling `AddAiTools` twice is idempotent.

### Phase 5 — fix: caller-cancellation isn't a model error (AI-028 follow-up, 2026-06-11)

Audit follow-up to AI-028. `TracingDecorator` caught a broad `Exception` and recorded an **error trace on cancellation** — so an SSE client disconnecting (which cancels the token, a *normal* end to a stream, and the common case once AI-031 lands) would count against the /ai-quality error rate. Both `CompleteAsync` and `StreamAsync` now rethrow a caller-initiated `OperationCanceledException` **untraced** (`when (ct.IsCancellationRequested)`); genuine model errors still persist an error trace. Tests: caller-cancel rethrows without tracing (one-shot + stream); a real model error still persists `error="boom"`.

### Phase 5 — real token streaming on the LLM seam (2026-06-11)

Phase 5 **AI-028**, slice 1 — the LLM providers actually stream now (the `StreamAsync` placeholder yielded one full delta). Provider + decorator only; the SSE endpoint (AI-031) and incremental UI (AI-032) build on this.

- **`OpenAiLlmClient.StreamAsync`** — real token streaming via `CompleteChatStreamingAsync`: each content fragment yields a `TextDelta` as it arrives, then a terminal usage delta (tokens + `ModelPricing` cost; falls back to 0 if the endpoint omits usage). Message-building shared with `CompleteAsync`; the reasoning-budget padding is preserved.
- **`LlmDelta` += `ModelId`** — the terminal usage delta carries the model id so the decorator can attribute a streamed call (deltas have no `TraceId`).
- **`TracingDecorator.StreamAsync`** — streamed calls are now observed like one-shot ones: it accumulates the text + terminal usage/model, then persists one sampled `LlmTrace` when the stream ends (or errors mid-flight), re-yielding every delta unchanged so real-time streaming is untouched.
- **`OllamaLlmClient`** — intentionally **not** streamed (it only serves one-shot SRS-distractor + eval-judge features, never a user stream): completes once and emits a text delta + terminal usage delta, satisfying the contract. Relabelled from a TODO to an intentional decision.
- Tests: `BuildStreamedResponse` (assembly + null-usage/model defaults); `StreamAsync` re-yields all deltas in order and persists a trace with the accumulated text + tokens + cost + model. Provider streaming itself (needs a key) is verified in staging before AI-031.

### Phase 4 RAG — citation-correctness judge — Phase 4 complete (2026-06-11)

Phase 4 **AI-027, slice 2 of 2** — the last DoD metric: cited excerpts actually support the claim (LLM-as-judge ≥0.9). **This closes Phase 4** ("Ask this book" is complete end to end: hybrid retrieval → spoiler-safe answer with citations → reader scroll → eval gate).

- **`RagAskService` → `IRagAskService`** + extracted `AskFromChunksAsync` — generates the grounded, cited answer from an already-retrieved chunk set (no reading user), so the eval drives the **real production prompt + citation parsing** rather than a reimplementation. `AskAsync` now delegates to it.
- **`RagEvalRunner` citation phase** — per retrieval golden: generate an answer over its chunks, then judge **each citation against the full text of its cited excerpt** (answer + excerpt as evidence) with the same MEAI `RubricEvaluator` the rest of the suite uses. Rubric axes: support / relevance / faithfulness. Reports the 1–5 mean and the **support rate** (citations scored ≥4 on support = the DoD ≥0.9 metric); persists a `rag.citation` `EvalRun`.
- **Judge selection** — `POST /admin/rag/{id}/eval?judge=openai|ollama|none`. Default **openai** (the stronger `Eval:JudgeModel`, independent of the nano generator → no self-judging bias); `ollama` free; `none` keeps the run retrieval-only.
- Tests: `RagEvalRunner` with a fake `IRagAskService` + fixed judge — full support (D1=5 → support rate 1.0) and a failing support axis (D1=2 → support rate 0.0); retrieval-only path still returns a null citation summary. Retrieval/spoiler tests updated for the new signature.

### Phase 4 RAG — retrieval eval + golden set (2026-06-11)

Phase 4 **AI-027, slice 1 of 2** — the deterministic half of the DoD gate: retrieval quality (recall@8) and spoiler-safety (leak rate), scored with no LLM so the math is CI-tested. Citation-correctness (LLM judge) is 027b, which closes the phase.

- **`RetrievalMetrics`** (`TextStack.Ai.Rag`) — pure: `IsHit` (a top-k chunk from the expected chapter **and** containing an expected phrase), `Recall` (fraction of goldens hit), `LeakCount`/`LeakRate` (chunks past the spoiler gate). Unit-tested.
- **Golden sets** (embedded in `Ai.EvalSuite/Datasets/`) — `rag.json` (12 starter DDIA retrieval questions: question + expected chapter + key phrases) and `rag_spoiler.json` (6 adversarial questions about later chapters, each with a gate). The retrieval set is a **starter to be curated to the DoD's 50** against the target edition (chapter ordinals align to that edition's numbering).
- **`RagEvalRunner`** (`Ai.EvalSuite`) — drives the production `IRagService` (hybrid retrieval, AI-023) over the goldens: recall ungated, spoiler gated at the reader's supposed position. Persists `rag.retrieval` / `rag.spoiler` `EvalRun` rows (score 0–1; the feature key disambiguates from the 1–5 judged features). Per-case hit/leak detail surfaced for the admin UI.
- **`POST /admin/rag/{editionId}/eval?k=`** — admin-triggered run against a real embedded edition (503 when embeddings aren't configured, like the other RAG debug endpoints). The real run happens on prod where DDIA is embedded.
- Tests: `RetrievalMetrics` (hit chapter/phrase/case, recall + leak math); `RagEvalRunner` with a fake `IRagService` (perfect → recall 1 / leak 0; leaky → recall 0 / leak 1; gate forwarding). Golden counts read from the dataset so they survive the set growing to 50.

### Phase 4 RAG — hybrid retrieval + RRF (2026-06-11)

Phase 4 **AI-023**. Retrieval is now **hybrid**: a lexical retriever runs alongside the vector one and the two rankings are fused, improving recall on rare terms, names, and code identifiers that embeddings alone miss.

- **Lexical branch** — generated `search_vector tsvector` column on `chapter_chunk` (`to_tsvector('english', …)`, STORED) + GIN index (migration `AddChapterChunkSearchVector`, raw SQL / out-of-model like chapters' `search_vector`). Ranked by `ts_rank_cd` over `websearch_to_tsquery`.
- **`RrfFusion`** (`TextStack.Ai.Rag`) — pure Reciprocal Rank Fusion (`Σ 1/(k+rank)`, `k=60`); order-stable, generic, unit-tested. Fuses the two rankings by chunk id.
- **`RagService`** runs both retrievers in one round-trip (`QueryMultiple`, pool `max(k,30)`), both spoiler-gated (AI-024) in their own WHERE. The lexical branch does **not** require an embedding, so it retrieves even before the batch embedder has filled vectors in. A stopword-only question yields an empty tsquery → the fusion degrades to vector-only. `RetrievedChunk.Score` is now the RRF score (not raw cosine).
- Verified: `RrfFusion` unit tests; migration applied + hybrid SQL (generated column, `ts_rank_cd`/`websearch_to_tsquery` AND-semantics, stopword degradation) validated on Postgres.

### Phase 4 RAG — mobile citation scroll (2026-06-11)

Phase 4 **AI-026, slice 4 of 4** — completes "Ask this book" (web + mobile, panel + exact scroll). Mobile citation chips now land on the cited **passage**, not just the chapter.

- **In-WebView `window.__textstackScrollToCitation(snippet, charStart)`** (`apps/mobile/src/lib/readerHtml.ts`) — same strategy as web (the chunk offsets are into PlainText, not the rendered DOM): a self-contained `TreeWalker` search for a short snippet of the chunk (skipping vocab/overlay decorations) → `scrollTo` centered + a brief flash via the CSS Custom Highlight API; else a proportional scroll by `charStart / textLength`.
- **`ReaderShell`** orchestrates: same-chapter citations inject the scroll immediately; cross-chapter ones navigate, then `onLoadEnd` injects the scroll once the new chapter renders (after scroll-restore). `AskSheet` now hands the citation up (`onCitation`) and `ReaderShell` owns the slug/snippet resolution.
- **`makeSnippet` moved to `@textstack/shared`** (used by web + mobile; web's `citationScroll` imports it). Tests moved with it.
- Verified: shared unit tests (incl. `makeSnippet`), mobile `tsc`, web `tsc`/build/tests.

### Phase 4 RAG — mobile AskSheet (2026-06-10)

Phase 4 **AI-026, slice 3 of 4**. "Ask this book" comes to the **mobile** reader (React Native).

- **`AskSheet`** (`apps/mobile`) — a bottom-sheet (mirrors `ExplanationSheet`) with a session Q&A history + composer; reached via a new top-bar button (catalog editions only). Citation chips `ch.N` navigate to the cited chapter (exact in-WebView scroll is slice 026d). Auth-gated: signed-out readers get a sign-in CTA.
- **Shared `ragApi.ask`** (`@textstack/shared/api/rag.ts`) — Bearer-auth `POST /books/{editionId}/ask`; mobile imports it directly. (Web keeps its own cookie-based `ask()`; the `AskCitation`/`AskResponse` types are already shared.) Shared `citationChapterSlug` helper (unit-tested) resolves a citation's chapter ordinal → slug.
- Shared i18n `reader.ask.*` strings.
- Verified: shared unit tests (incl. `citationChapterSlug`), mobile `tsc`, web `tsc`/build/tests unaffected.

### Phase 4 RAG — web citation scroll (2026-06-10)

Phase 4 **AI-026, slice 2 of 4**. Citation chips now land the reader on the cited **passage**, not just the chapter.

- **`citationScroll`** (`lib/citationScroll.ts`) — clicking a citation scrolls to the cited text. The chunk offsets are into `PlainText` (which differs from the rendered HTML's DOM text), so instead of an unreliable offset→DOM mapping it **searches the DOM for a short prefix of the chunk** (`findTextMatches`, like in-book search) and centers that range; if the snippet doesn't match (spans inline markup), it **falls back to a proportional scroll** by `charStart / textLength` — exact in the common case, robust always.
- Wired in `ReaderPage`: same-chapter citations scroll immediately; cross-chapter ones navigate and a `loading`-gated effect scrolls once the new chapter renders (after scroll-restore, so the explicit jump wins).
- **Flash-highlight** the landed passage briefly (CSS Custom Highlight API, no DOM mutation; graceful no-op where unsupported) so the reader sees *what* was cited.
- Snippet search **skips reader decorations** (vocab glosses / overlays) so it anchors on the book text, not a gloss. Cross-chapter scroll fires via double-`requestAnimationFrame` (runs after scroll-restore) instead of a magic timeout.
- Tests: `makeSnippet` (word-boundary cut / too-short), `proportionalTop` (clamp + center), `findCitationRange` (jsdom DOM search hit / miss / decoration-skip).

### Phase 4 RAG — web AskPanel (2026-06-10)

Seventh PR of Phase 4 (playbook **AI-026**, slice 1 of 4 — web panel, chapter-level citations). Surfaces the AI-025 "Ask this book" endpoint in the web reader.

- **`AskPanel`** — a right slide-in panel (mirrors `ReaderSettingsDrawer`) with a session Q&A history (chat-style, not persisted) and a composer. Reached via a new "Ask" button in `ReaderTopBar`, shown only for catalog editions (user uploads aren't chunked). Auth-gated: signed-out readers get a sign-in CTA.
- **Citations** render as `[ch.N]` chips (hover → the backend text preview); clicking navigates the reader to that chapter (exact char-offset scroll is slice 026b).
- **`useAsk` hook** + `api/ask.ts` (cookie `authFetch` POST `/books/{editionId}/ask`); shared `AskCitation`/`AskResponse` types in `@textstack/shared` (mobile reuses them in 026c).
- Tests: `useAsk` (append / error / insufficient / no-edition) + `AskPanel` render (auth branching, citation-chip click). The render test caught a real bug — the auto-scroll used `Element.scrollTo` (absent in jsdom / fragile); switched to the robust `scrollTop` setter.

### Phase 4 RAG — "Ask this book" endpoint (2026-06-10)

Sixth PR of Phase 4 (playbook **AI-025**). The feature itself: ask a question about a book you're reading, get a grounded 2–4 sentence answer with citations.

- **`POST /books/{editionId}/ask`** (authenticated) — retrieves spoiler-safe context (AI-024 `RagContextService`), generates an answer via the LLM gateway (FeatureTag `rag.ask` → OpenAI, traced into `llm_traces`), returns `{ answer, citations[], lastReadOrd, insufficient }`. Rate-limited 30/min per IP.
- **`RagAskService`** (`Application/Rag`) + **`RagAskPrompt`** (pure static, eval-reusable): numbered excerpts `[1] (ch.N) …` + the reader's private notes → an answer that cites every claim with `[n]`; `ParseCitations` maps markers back to the cited chunks (with chapter ord + char offsets for the reader deep-link).
- **No-context short-circuit** — a reader with no progress gets a plain "read more first" answer with **no LLM call** (zero cost).
- **JSON for now** — `ILlmService.StreamAsync` is still one-shot, so SSE/token streaming is deferred to AI-028 (Phase 5) where it's real; the answer arrives whole today (identical UX). The reader UI + clickable citations are AI-026.
- Tests: `RagAskPrompt`/`ParseCitations` unit tests + an integration test (no-auth → 401; answer path skips without a key/corpus).

### Phase 4 RAG — spoiler gate + private corpus (2026-06-10)

Fifth PR of Phase 4 (playbook **AI-024**). Makes retrieval spoiler-safe and adds the user's own annotations as guaranteed context — the capability the public Ask endpoint (AI-025) consumes.

- **Spoiler gate** — `RagService.RetrieveAsync` gains an optional `maxChapterOrd`; the SQL adds `AND (@maxChapterOrd IS NULL OR chapter_ord <= @maxChapterOrd)`. A **hard SQL filter**, never a prompt instruction — only chunks from chapters the user has read are returned.
- **`RagContextService`** (`Application/Rag`) — resolves the user's last-read chapter ordinal from `ReadingProgress` (join `Chapter.ChapterNumber`; **0 = no progress → empty context, strict**), runs gated retrieval, and gathers the user's **highlights + notes** from read chapters as guaranteed private-corpus context. The gate is inclusive of the current chapter (within-chapter leakage is an accepted v1 limit — chunking is chapter-granular).
- **Admin debug endpoints** — `/admin/rag/{ed}/search` gains `&maxChapterOrd=` (test the gate with a synthetic ceiling); new `/admin/rag/{ed}/context?userId=&q=` runs the full spoiler-safe path for a user (admin impersonation) → `{ lastReadOrd, chunks[], notes[] }`, so AI-024 is verifiable before AI-025.
- Tests: `HighlightToText` unit tests + an integration test asserting `maxChapterOrd=0` → `[]` (gate works).

**Review follow-ups folded in:**
- **High-water mark** — the gate now uses the *furthest* chapter the user has reached, not their current position, so flipping back to an earlier chapter no longer hides already-read later chapters. New nullable `reading_progress.max_chapter_number` (migration `AddMaxChapterToReadingProgress`), maintained monotonically on each progress save; legacy rows fall back to the current chapter (no backfill, self-heals).
- **Private-corpus cap** — `RagContextService` caps included highlights/notes at 30 (most recent chapters first) so a heavy annotator can't blow the prompt budget.
- **Note dedup** — notes attached to a highlight are skipped (the highlight's inline `NoteText` already carries them) to avoid double-counting.
- **Skip wasted embedding** — `RagService` short-circuits to empty when the gate is ≤ 0 (no chapters read), avoiding an embedding API call.
- Deferred (by design): min-score relevance threshold → AI-023; within-chapter spoiler precision → future.

### Phase 4 RAG — vector retrieval (RagService) (2026-06-10)

Fourth PR of Phase 4 (playbook **AI-022**). First retrieval step: embed a query, find the nearest chunks in an edition by cosine similarity over pgvector.

- **`RagService`** (`TextStack.Ai.Rag`) — embeds the query via `IEmbeddingService`, then runs **raw Npgsql + Dapper** (not EF, so the spoiler gate can later live in the SQL `WHERE`): `ORDER BY embedding <=> CAST(@q AS vector) LIMIT @k` over `chapter_chunk`, using the HNSW `vector_cosine_ops` index. Per-edition, `embedding IS NOT NULL`, top-K (default 8 = recall@8 target), score = 1 − cosine distance.
- **Query-vector binding:** the embedding is formatted as a `[…]` text literal (`FormatVector`, invariant-culture) and cast server-side — a raw connection doesn't have the pgvector type registered (`UseVector()` is EF-only), so this avoids `NpgsqlDataSource`/type-handlers.
- **Admin debug endpoint** `GET /admin/rag/{editionId}/search?q=&k=` — returns top-K chunks (score + citation offsets + text preview) so retrieval is inspectable now. Admin-only; vector-only (no spoiler gate yet — that's AI-024, before the public Ask endpoint). The public Ask + SSE + citations stay AI-025.
- Tests: `FormatVector` unit tests (bracket/comma shape, invariant culture under a comma-decimal locale, empty/single) + an admin-endpoint integration test (missing-query → 400; query path skips without a key/corpus).

### Phase 4 RAG — OpenAI embeddings + batch worker (2026-06-10)

Third PR of Phase 4 (playbook **AI-020**). Fills `chapter_chunk.embedding` so retrieval (AI-022+) has vectors to search.

- **`OpenAiEmbeddingClient`** (`TextStack.Ai.Llm`, next to `OpenAiLlmClient`) — first implementation of `IEmbeddingService`, wrapping the OpenAI SDK `EmbeddingClient` for `text-embedding-3-small` (1536-d). Same config/empty-key guard as the LLM client; cost logged per batch via `ModelPricing` (added `text-embedding-3-small` = $0.02/1M input).
- **`ChapterEmbeddingWorker`** — perpetual `BackgroundService` that polls `chapter_chunk WHERE embedding IS NULL`, embeds in batches of 100, and writes the vectors back. Covers freshly-ingested books **and** drains the existing backlog, so AI-021 backfill becomes a roll-out concern rather than new code. **Self-disables** with no OpenAI key (keyless dev host still starts); survives errors (outer retry); on a batch failure falls back to per-item so one bad chunk can't stall the backlog (parked in-memory to avoid re-fetch).
- **Scope:** catalog chunks only. Embedding observability is cost-log only for now (full `llm_traces` for embeddings deferred).
- Unit tests: `ModelPricing` embedding cost (input-only, ignores output tokens) + `AssignEmbeddings` order-preserving assignment / count-mismatch guard.

### Phase 4 RAG — sentence-aware chunker (2026-06-09)

Second PR of Phase 4 (playbook **AI-019**). Fills the `chapter_chunk` table created in AI-018: catalog ingestion now emits retrieval-sized chunks (embeddings come in AI-020/021).

- **New `TextStack.Ai.Rag` library** with a hand-rolled, sentence-aware `Chunker`: splits chapter plain text into ~512-token windows with 64-token overlap, recording exact `char_start`/`char_end` offsets back into the source text (parent-context expansion + citation deep-links). Hand-rolled rather than SemanticKernel `TextChunker` because the latter returns strings without offsets.
- **Exact token counts** via `Microsoft.ML.Tokenizers` (cl100k tiktoken, matching `text-embedding-3-small`) for both chunk boundaries and the stored `token_count`. The `Data.Cl100kBase` package ships the vocab so it works offline. Transitive `Microsoft.Bcl.Memory` pinned to 10.0.9 to clear advisory GHSA-73j8-2gch-69rq (NU1903).
- **Wired into catalog ingestion** (Worker `IngestionService`, right after search indexing): loads the just-saved chapters, chunks each, bulk-inserts `chapter_chunk` rows with `embedding = null` and `chapter_ord` copied from the chapter. Best-effort — a chunking failure logs a warning and never fails the ingestion job; old chunks cascade-delete on reprocess.
- **Scope:** catalog editions only (the AI-018 schema FKs to `chapters`/`editions`). User-uploaded books deferred to a future PR. Existing already-ingested editions get chunks on next reprocess until the AI-021 backfill lands.
- Unit tests (`ChunkerTests`, 13 cases): sentence-split offset round-trip, token-budget bound, overlap, 0-based contiguous `Ord`, empty input, oversized-single-sentence.

### Phase 4 RAG — pgvector + chapter_chunk storage (2026-06-09)

First PR of Phase 4 "Ask this book" (playbook PR **AI-018**). Lays the vector-storage foundation only — no chunker/embeddings/retrieval yet.

- **pgvector enabled.** DB image `postgres:16` → `pgvector/pgvector:pg16` (docker-compose + CI service); existing data volume is compatible (stock pg16 + extension binary, no re-init). Migration `AddPgVectorAndChunks` emits `CREATE EXTENSION IF NOT EXISTS vector` ahead of the table.
- **`chapter_chunk` table** (singular name to match the playbook DDL and the future raw-Npgsql retrieval SQL). Columns: uuid PK, `edition_id`/`chapter_id` (cascade FKs), `ord`, `text`, `embedding vector(1536)`, `token_count`, `created_at`. Two columns beyond the playbook schema, per `bootcamp-rag-analysis.md`: `chapter_ord` (denormalized so the spoiler gate filters in SQL without a join) and `char_start`/`char_end` (parent-context expansion + citation deep-links).
- **Embedding nullable** — the chunker (AI-019) inserts text first; the batch embedder (AI-020/021) fills vectors later. Retrieval SQL adds `embedding IS NOT NULL`.
- **Indexes:** HNSW `(embedding vector_cosine_ops)` for cosine ANN; btree `(edition_id, chapter_id, ord)`.
- **Domain stays framework-free** — `ChapterChunk.Embedding` is `float[]`, converted to `Pgvector.Vector` only in EF mapping (`AppDbContext.Rag.cs`). `Pgvector` + `Pgvector.EntityFrameworkCore` added centrally; `.UseVector()` wired in all 3 DbContext registrations (Api/Worker/Factory). Not exposed on `IAppDbContext` — retrieval uses raw Npgsql.
- **Microsoft-libs boundary:** generation layer (chunker/embeddings, AI-019/020) will use `Microsoft.Extensions.AI` + SK `TextChunker`; the pgvector storage/access layer stays raw Npgsql so the spoiler gate lives in SQL.

### EPUB chapter parsing fix + correct book progress on book detail (2026-06-09)

- **Fix: book detail page showed chapter % as book %** (e.g. "85%" on `my-books/[id]` while on chapter 2). The page rendered `savedProgress.percent` (chapter-scroll) directly; it now computes book-wide percent via `computeBookProgress`, matching the reader footer and library cards.
- **Fix: EPUB chapters mis-titled / content not matching titles.** On EPUBs that split one logical chapter across two spine files — a heading-only file (`<h1>10</h1>`) plus a separate body file — the extractor produced doubled, mis-titled chapters (a 1-word "10" chapter, then a body titled with the book name, with titles drifting against content). Root causes:
  - `HtmlCleaner.ExtractTitle` fell back to the `<head><title>` element, which in professionally-produced EPUBs is the **book** title on every page. That mislabeled untitled spine files and, via `HasProperTitle`, blocked the merge of a heading file with its body. New `HtmlCleaner.ExtractHeadingTitle` (visible `h1/h2/h3` only) is now used for per-chapter titling; book-level `ExtractTitle` is unchanged.
  - Added heading-stub recombination in `EpubTextExtractor`: a bare chapter-number file (`IsHeadingNumberStub` — ≤3 words, digits only) is merged into the following body file, keeping the stub's nav-derived title.
  - Not an AI-model issue — chapter splitting/titling is deterministic extraction; the LLM only fills genre/year/description metadata.
  - Already-uploaded books re-parse via `POST /me/books/{id}/retry`.

### Mobile — unified reader + correct book progress (2026-06-09)

Reading-progress fixes + a structural refactor that collapses the two readers (catalog + user-uploaded) into one code path, killing the "two readers drift" bug class.

- **Unified reader** — catalog and user-book readers now share ONE path: `ReaderRuntime` contract (`readerSource.ts`), `useEditionReaderSource` / `useUserBookReaderSource` (the only place the catalogs differ — data fetch + progress I/O), shared `Reader.tsx` → `ReaderShell.tsx`. The two route files are thin wrappers. The divergent progress hooks (`useReaderProgress` / `useUserBookProgress`) are deleted in favor of one `useReaderPersistence`.
- **Fix: reopening a book returned to the top of the chapter** — saved scroll position was fetched asynchronously but `onLoadEnd` often fired first, so restore ran once (guarded) before the position arrived and was skipped forever. Restore is now a state machine gated on `webViewLoaded && positionLoaded`, whichever lands last — no race, both readers, offset **or** percent. The user-book reader also regains the percent-restore fallback it had lost to copy-paste drift.
- **Fix: Library cards showed chapter % as book %** ("85%" on chapter 2 of 10). `LibraryShelvesService` (Continue reading / Recently added / Quick reads) now converts chapter-percent → book-percent via `BookProgressCalculator` (C# mirror of the client's `computeBookProgress`), weighting by chapter word counts. Current chapter is located by the progress locator's slug (accurate after infinite-scroll), falling back to `ChapterId`; user-books by `ProgressChapterSlug`. `EstimateRemaining` ("X min left") now uses book-percent too.
- **Fix: changing a reader setting mid-chapter jumped to the top** — a font/theme/spacing change rebuilds the WebView HTML; the reader now re-applies the live position by percent (layout-relative) on that reload instead of dropping to the top.

### AI platform — eval framework → Microsoft.Extensions.AI.Evaluation (2026-06-07)

Migrated the hand-rolled eval runner/judge to the **stable** `Microsoft.Extensions.AI.Evaluation` framework (10.6.0), keeping our golden datasets the source of truth and scores comparable. Shipped as 7 small steps on one branch.

- **AI-010a — eval suite on MEAI.Evaluation** (this PR) — a follow-on refinement of the Phase 2 eval epic (AI-006/009/010), not a roadmap PR — AI-018 is reserved for Phase 4 (pgvector). Replaces the bespoke `JudgeRunner.JudgeAsync` LLM-as-judge with MEAI's `IEvaluator` model, end to end:
  - **`LlmServiceChatClient`** adapts our `ILlmService` seam to MEAI's `IChatClient`, so evaluators call the same Ollama/OpenAI gateway (no new service).
  - **`RubricEvaluator : IEvaluator`** ports the judge 1:1 — the **same** system prompt + **same** strict-JSON parse (now shared statics on `JudgeRunner`) → identical scores given the same judge reply; emits the 3 rubric axes + overall as `NumericMetric`s, gated Pass/Fail on the same floors.
  - **Goldens unchanged** (`GoldenLoader` + embedded `Datasets/*.json`) feed `ReportingConfiguration` scenarios; runs persist to a disk store with a **30-day response cache** (re-runs don't re-hit the judge) and an **HTML report** (`data/eval-meai/`).
  - Opt-in **built-in quality evaluators** (Coherence + Relevance on explain/vocab) behind `EVAL_QUALITY=1`; default CI stays deterministic.
  - The admin **`POST /admin/ai-quality/evals/run`** now scores via `RubricEvaluator` (signature + DI + `eval_runs` persistence unchanged); the legacy instance judge path is removed and `JudgeRunner` is now a static prompt/parse utility.
  - **Parity proven** deterministically (`RubricEvaluatorTests`) and live (Ollama gemma3, N=30: legacy vs MEAI within ±0.05 on every feature). See `docs/eval-migration.md`.

### AI platform — Phase 3: Podcast MVP (2026-06-06)

Two-voice "podcast" (NotebookLM-style dialogue) generated per catalog edition: LLM builds a script, Edge TTS voices each line, ffmpeg stitches an mp3 the reader can play. Shipped in small PRs.

- **AI-017 — podcast goldens (Phase 3 complete)** (this PR) — adds the podcast script to the in-app eval suite: 5 hand-curated `{title, author, excerpt}` goldens (`Datasets/podcast.json`, embedded) + a `podcast` feature in `EvalDefinitions` that generates a 2-host dialogue from the excerpt via the real `PodcastPrompt` (gateway, `podcast.script`→OpenAI) and judges it on a 3-axis rubric (grounding / naturalness / structure). Surfaces in `/ai-quality` (Evals tab + `podcast.script` cost in Summary). Cost gating stays observability-only (hosted CI has no LLM secrets, per AI-010); run on-demand via the admin "Run evals" or `dotnet test --filter Category=Eval`. **Phase 3 (Podcast MVP) is complete** — AI-011→017.
- **AI-016 — podcast UI** (this PR) — makes the podcast visible. **Admin** (`EditEditionPage`): a "Podcast" section with a **Generate** button (`POST /admin/podcasts`), live status polling (Queued→Running→Succeeded/Failed) and an inline `<audio>` preview when ready; a small admin-only `GET /admin/podcasts/{editionId}` status endpoint backs the poll. **Web** (`BookDetailPage`): when a podcast exists for the book, a "🎧 Listen as a podcast" native `<audio>` player appears in the hero (public `GET /books/{slug}/podcast`). Native audio, no new deps; admin preview prefixes the API media origin (`mediaBase`) since the mp3 is served from the API host. With this, Phase 3 is user-visible: admin curates podcasts, anyone listens.
- **AI-015 — podcast endpoints** (this PR) — HTTP to enqueue + check a podcast (no more manual SQL). **`POST /admin/podcasts` {editionId, lang?}** enqueues a job — **admin-only** (guarded by AdminAuthMiddleware), idempotent (returns the existing queued/running/succeeded job for that edition+lang). **`GET /books/{slug}/podcast`** is public: resolves the catalog edition (site+language+published, like `BooksEndpoints`) and returns the latest job as `{jobId, status, audioUrl?, durationSeconds?}` (`audioUrl = /storage/{AudioPath}` once succeeded). The mp3 is served by the existing `/storage` static root — no nginx/infra change. (Generation is curated from the admin panel; the reader just plays — see AI-016.)
- **AI-014 — `PodcastWorker` (feature live end-to-end)** (this PR) — the background service that ties Phase 3 together: polls `podcast_generation_jobs`, and for each Queued job runs `PodcastScriptBuilder` → `AudioAssembler` → saves the mp3 via `IFileStorageService` → updates status (Queued→Running→Succeeded/Failed) with `ScriptJson`, `AudioPath`, `DurationSeconds`. Mirrors `IngestionWorker` (singleton `BackgroundService`, per-job DI scope, 5s poll, 10-min stuck-job recovery, loop survives errors). With this, a queued job now produces a playable podcast mp3 — the API endpoint + reader button (AI-015/016) just enqueue and play. `CostUsd` stays null for now (per-call cost lives in `llm_traces`).
- **AI-013 — `AudioAssembler` + ffmpeg** (this PR) — turns the Aria/Guy script into one mp3: each line is synthesized with the matching **Edge TTS** voice (`en-US-AriaNeural` / `en-US-GuyNeural`, free) and the segments are stitched with **ffmpeg** (concat demuxer, `-c copy` — no re-encode). `Worker.Services.AudioAssembler` (`IAudioAssembler` → `PodcastAudio{Mp3,DurationSeconds}`); duration estimated from the fixed 48 kbit/s bitrate. Pure helpers (`VoiceFor`, `BuildConcatFileContent`, `EstimateDurationSeconds`) are unit-tested. Worker now references `TextStack.Tts` + registers TTS/assembler in DI, and the Worker Docker image installs `ffmpeg`. Service only — wired into the worker in AI-014. (MVP: English voices, no crossfade.)
- **AI-012 — `PodcastScriptBuilder` (structured dialogue)** (this PR) — turns a catalog edition into a 2-voice (Aria/Guy) podcast script: loads chapters (ordered), fits them into a ~6000-word budget, prompts the gateway (FeatureTag `podcast.script` → OpenAI `gpt-4.1-nano`) for a strict-JSON dialogue array, parses it. `Application.Ai.PodcastPrompt` (reusable prompt) + `Worker.Services.PodcastScriptBuilder` (`IPodcastScriptBuilder`, records `PodcastScript`/`DialogueLine`) with a unit-tested `ParseScript` (robust to prose/fences; drops empty lines + non-Aria/Guy speakers). FeatureTag + `Ai:Routes` wired (Api + Worker), DI registered. Service only — not invoked yet (Worker/endpoints/UI/audio in AI-013→016).
- **AI-011 — `PodcastGenerationJob` entity + migration** (this PR) — foundation only (no behavior). New `PodcastGenerationJob` (edition-scoped: `EditionId` FK cascade, `Lang`, `Status`, `ScriptJson` jsonb, `AudioPath`, `DurationSeconds`, `CostUsd`, `Error`, timestamps) + `PodcastJobStatus` enum (Queued/Running/Succeeded/Failed), mirroring the `BookQualityJob` job pattern. DbSet on `IAppDbContext`/`AppDbContext`, EF config in `AppDbContext.Podcasts.cs` (indexes on status + edition), migration `AddPodcastGenerationJob` (table `podcast_generation_jobs`). Script builder will use the gateway (`gpt-4.1-nano`, FeatureTag `podcast.script`); TTS reuses the free Edge TTS. ScriptBuilder/AudioAssembler/Worker/endpoints/UI follow in AI-012→017.

### AI platform — observable LLM layer (foundation) (2026-06-04)

Building a unified, observable LLM layer so every AI call (Explain, Translate,
Distractor, BookMetadata, TagSuggestion, …) routes through one seam and is
logged for cost/latency/quality. Shipped as small, self-contained PRs; the new
stack runs in parallel with the legacy `ILlmServiceFactory` path — callers
migrate later (AI-005), so behavior is unchanged so far.

- **AI-001 — `TextStack.Ai.Core`** ([`dc7b28e`](https://github.com/mrviduus/textstack/commit/dc7b28e)) — new class library with the AI contracts: `ILlmService` (LlmRequest/LlmResponse/LlmUsage/LlmMessage/LlmDelta), `ITool`, `IEmbeddingService`, `IAgent`, `ILlmTraceWriter` + supporting records. Pure interfaces, zero implementations.
- **AI-002 — `TextStack.Ai.Llm` providers** ([`bff1523`](https://github.com/mrviduus/textstack/commit/bff1523)) — `OpenAiLlmClient` + `OllamaLlmClient` ported 1:1 from the legacy services onto the new `ILlmService` (production quirks preserved verbatim: OpenAI reasoning-budget `+512` padding, Ollama `think=false`). `ModelPricing` is the single source of per-model USD cost, surfaced on `LlmResponse.Usage`.
- **AI-003 — TracingDecorator + `llm_traces`** ([`54d2598`](https://github.com/mrviduus/textstack/commit/54d2598)) — singleton decorator wraps any provider and records a **sampled** trace (cost/tokens/latency/error) **fire-and-forget** on a fresh DI scope, so persistence adds no latency. New Postgres table `llm_traces` (jsonb messages, `numeric(10,6)` cost, FK user ON DELETE SET NULL) + `DbLlmTraceWriter`. Email/phone redacted before persist; errors always sampled, high-volume features sampled at 10% (ADR-AI-011).
- **AI-004 — `ModelGateway` v0 + DI composition** ([`d6f9e95`](https://github.com/mrviduus/textstack/commit/d6f9e95)) — `ModelGateway` (a composite `ILlmService`) routes each call to a provider by `FeatureTag` via `Ai:Routes` config, then the full stack is wired in DI: keyed providers → `TracingDecorator` → gateway as the default `ILlmService`. Routing mirrors the existing per-feature mapping (explain/translate → OpenAI, distractor/bookmeta/tagsuggestion → Ollama) so nothing changes until callers migrate. Cost-cap / shadow / escalate are deferred to a later phase.
- **AI-005 — legacy adapter + route callers through the new stack** (this PR) — `LlmServiceFactory.Get(job)` now returns a `LegacyLlmAdapter` over the gateway instead of the old keyed providers, so all 5 callers (Explain, Translate, Distractor, BookMetadata, TagSuggestion) run through `ModelGateway → TracingDecorator → provider` **with zero caller changes** — and traces now flow end-to-end into `llm_traces`. Routing/behavior preserved (FeatureTag map mirrors the old `LLM:Providers`). The dead `OpenAiLlmService`/`OllamaLlmService` are deleted; the `Domain.LLM.ILlmService` interface + adapter remain until callers move to `Core.ILlmService` directly.
- **AI-006 — `TextStack.Ai.Evals` + first golden (Explain)** (this PR) — quality measurement for the LLM layer. New `TextStack.Ai.Evals` library: feature-agnostic `GoldenRunner` (runs a golden dataset through `ILlmService`) and `JudgeRunner` (LLM-as-judge → strict-JSON `{accuracy, conciseness, usefulness}` 1–5 + aggregate). First golden: 30 hand-curated Explain cases (dev/AI domain + general) in `tests/TextStack.AiEvals/Datasets/explain.json`, scored against the **real** Explain prompt (extracted to `Application.Ai.ExplainPrompt` so eval and endpoint can't drift). The eval runs as an **opt-in** `dotnet test` (`Category=Eval`) that self-skips without `OPENAI_API_KEY`, so default CI stays green; run it with `OPENAI_API_KEY=… dotnet test tests/TextStack.AiEvals --filter Category=Eval`. Judge routes through the same OpenAI gateway now (FeatureTag `eval.judge`); swapping to Claude is a later config/provider change. Baseline capture + a CI regression gate are deferred (AI-010).
- **AI-007 — goldens for Translate / Vocab / BookMetadata** (this PR) — extends eval coverage to the rest of the gateway-reachable AI surfaces (SEO stays out — it runs via Claude CLI, not `ILlmService`). The judge harness is generalized: `JudgeRunner` now takes a per-feature `Rubric` (three named axes) instead of the fixed accuracy/conciseness/usefulness triple, so each feature scores on relevant dimensions (Translate: accuracy/fluency/register; distractor: plausibility/distinctness/difficulty; hint: helpfulness/no-spoiler/brevity; explanation: accuracy/clarity/nativeness; bookmeta: genre/year/description). Three new 30-case golden datasets + opt-in eval tests. Real prompts extracted to reusable builders (`Application.Ai.TranslatePrompt`, `TextStack.Vocabulary.DistractorPrompt`, `Worker.Services.BookMetadataPrompt`) so evals can't drift from production (pure extracts — caller behavior unchanged). Generation runs on each feature's real provider (Translate→OpenAI, Vocab/BookMeta→Ollama) while the judge runs on OpenAI (`eval.judge`); tests self-skip when the key/Ollama isn't present, so default CI stays green. Run: `OPENAI_API_KEY=… dotnet test tests/TextStack.AiEvals --filter Category=Eval` (Ollama running for vocab/bookmeta).
- **AI-008 — `/ai-quality` admin dashboard (Summary tab)** (this PR) — makes the LLM layer **visible**. New admin page surfaces, per `feature_tag` over a selectable window (7/30/90d), what was previously buried in `llm_traces`: cost (total + /day), p50/p95 latency, error rate, call volume, token counts, and a tiny inline-SVG cost-per-day sparkline. Backend: `GET /admin/ai-quality/summary?from=&to=&feature=` (admin-only via AdminAuth) aggregates `llm_traces` with raw SQL (`percentile_cont` for true p50/p95). Frontend: `apps/admin` page + nav entry, no chart dependency. Judge-score trends are deferred until eval runs persist to a table (AI-010); Traces + Evals drill-down tabs are AI-009.
- **AI-009 — `/ai-quality` Traces + Evals tabs (+ `eval_runs`)** (this PR) — drill-down for the dashboard. **Traces tab**: searchable, paged table over `llm_traces` (filter by feature + free-text `ILIKE` on prompt/response) with a click-through detail modal showing the full system prompt, messages, response, tool calls and metrics. **Evals tab**: per-feature eval-score history with regressions flagged red (score drop >0.1 vs the previous run). New `eval_runs` table + entity persist eval results — keyed by `feature` string (no `eval_dataset` FK, since goldens are file-based per ADR-AI-006), written best-effort by the opt-in eval suite when `EVAL_DB_CONNECTION` is set. Backend: `GET /admin/ai-quality/traces`, `/traces/{id}`, `/evals` (admin-only). **Eval judge is now provider-selectable** (`EvalClients.Judge()`): defaults to OpenAI, set `EVAL_JUDGE=ollama` to judge locally on gemma4 — vocab/bookmeta then run **fully on local Ollama** with no OpenAI key (a small local judge is noisier, so scores are looser). A CI regression gate on top of `eval_runs` is AI-010.
- **AI-010 — in-app eval runner + admin "Run evals"** (this PR) — evals become a product capability: a new **`TextStack.Ai.EvalSuite`** library (separate from API/Application) holds the goldens (embedded), per-feature `EvalDefinitions` (real prompts + rubrics) and `EvalSuiteRunner`. An admin button (`POST /admin/ai-quality/evals/run`, background, one-at-a-time guard + `GET .../evals/status`) runs the suite **on prod through the real `ModelGateway`** — explain/translate→OpenAI, vocab/bookmeta→Ollama, exactly like production — judging by default on **local Ollama/gemma4 (free, no OpenAI key)** or OpenAI. Results persist to `eval_runs`; the Summary tab now shows the latest **eval score** per feature, and the Evals tab still flags regressions. The `dotnet test` eval suite is consolidated onto the same runner (one source of truth for goldens/prompts/rubrics; the bespoke per-feature test classes + the `EVAL_DB_CONNECTION` recorder are removed). No baseline-file CI gate (hosted CI has no LLM secrets); regression is human-in-the-loop via the dashboard.

### Web header — restore search icon on non-home pages (2026-05-24)

- **Search icon back in the header** ([`4eb1986`](https://github.com/mrviduus/textstack/commit/4eb1986)) — was removed in [`3e53e3e`](https://github.com/mrviduus/textstack/commit/3e53e3e) on the assumption that the hero search on home was enough. It wasn't: on every other page (library, discover, vocabulary, reader, …) the hero is gone and users had nowhere to launch a search from. Icon now shows on all routes except home (where the hero input still owns the affordance), opens the existing `MobileSearchOverlay`, and ships with 10 new `Header.test.tsx` cases pinning visibility per route + open/close flow.

### Safe refactor — backend partial-class splits + util tests (2026-05-24)

Cosmetic refactor pass: three god-class backend files split across C# partial
files (compile-identical to original IL — zero behaviour change, integration
tests verify), plus net-new unit-test coverage on critical web + mobile pure
utilities. Largest non-migration backend file dropped from 1559 → 875 LOC.
All splits use single-domain-per-file boundaries so future review can scope
to one concern without scrolling past nine others.

- **`AppDbContext.cs` split** ([`1932b21`](https://github.com/mrviduus/textstack/commit/1932b21)) — EF Core model configuration extracted from one 655-LOC `OnModelCreating` to 7 domain-scoped partial files (`Catalog`, `User`, `Reading`, `UserBooks`, `Vocabulary`, `Ops`, `Seo`, `Collections`). Main file is now 104 LOC of DbSet declarations + dispatcher. Migrations unaffected — EF model snapshot is identical.
- **`VocabularyEndpoints.cs` split** ([`1932b21`](https://github.com/mrviduus/textstack/commit/1932b21)) — 1559-LOC single endpoint file split: 6 sub-domain partials (`Stats`, `Settings`, `Pending`, `Lookups`, `Clusters`, `Admin`) for the 24 routes that were drowning each other out. Shared helpers (`TryGetAuth`, `ToDto`, `UpsertLookupAsync`, `QueueEnrichment`) stay in main alongside `MapVocabularyEndpoints` + DTOs. Reviewer can now diff one anti-spiral phase without seeing the others.
- **`AdminService.cs` split** ([`1932b21`](https://github.com/mrviduus/textstack/commit/1932b21)) — 977-LOC god service split into 4 partial files by domain (`Upload`, `Editions`, `Chapters`, `UserUploads`). Primary constructor + DI + shared `EnqueueSsgSafe` helper stay in main (131 LOC). Each domain partial under 400 LOC.
- **Web util tests** ([`1932b21`](https://github.com/mrviduus/textstack/commit/1932b21)) — 40 new Vitest cases covering `analytics.ts` (GA4 event shape contract, gtag fallback, PII boundaries), `dataEvents.ts` (CustomEvent bus + cross-component hook), `errorUtils.ts` (HttpError detection), `formatTime.ts` (hour/minute formatting). Web suite now 474 tests.
- **Mobile Vitest infra + pure-util tests** ([`1932b21`](https://github.com/mrviduus/textstack/commit/1932b21)) — new `vitest.config.ts` with an in-process `AsyncStorage` mock alias so any `lib/` module can be unit-tested without RN runtime. 38 cases covering `searchUtils` (NFD diacritic stripping incl. surprising Cyrillic `й` → `и` behavior, documented), `features` (reader-overlay killswitch cascade), `vocabStatsCache` (TTL + corrupt-JSON defense). Mobile lib code can now be tested without bundling RN.

### Mobile reader — bug sweep + architecture refactor (2026-05-23)

Five user-reported Android bugs blocking Play Store launch, plus a senior
architecture pass extracting pure logic to `@textstack/shared` so both
catalog and user-book readers share the same formulas (book-progress,
LWW merge, locator parsing). 144 unit tests + 9 property-based tests
(~2300 generated cases), 100% behavioral coverage on shared reader code.

- **TOC sheet no longer empty** ([`1d81cf7`](https://github.com/mrviduus/textstack/commit/1d81cf7)) — chapter list rendered as 0-height sheet when chapters hadn't loaded; now shows loading spinner or "No chapters available" with `minHeight: 200`. Both `apps/mobile/app/reader/.../[chapterSlug].tsx` (catalog) and `apps/mobile/app/my-books/read/.../[chapterSlug].tsx` (user-books) wire `chaptersLoading` state through to `TocSheet`.
- **Save word closes the toolbar** ([`1d81cf7`](https://github.com/mrviduus/textstack/commit/1d81cf7)) — `useReaderVocabActions.saveWord` now calls `setSelection(null)` after success / `already_saved` / `pending`, matching `markKnown` and `removeWord`. Added `savingRef` race guard for rapid double-taps. Same fix in `promoteLookup`.
- **Selection toolbar has a close button** ([`1d81cf7`](https://github.com/mrviduus/textstack/commit/1d81cf7)) — `SelectionActionBar` accepts `onClose` prop and renders an X icon. Both readers also clear the native WebView selection range so leftover highlight rectangles don't linger after dismissal.
- **Progress bar shows book %, not chapter %** ([`1d81cf7`](https://github.com/mrviduus/textstack/commit/1d81cf7)) — new pure `computeBookProgress(chapters, slug, chapterProgress, totalWordCount)` in `@textstack/shared/reader` (word-count weighted with chapter-index fallback). Both readers compute book % on every WebView `progress` message + eagerly on chapter nav. `LocalProgress.bookPercent` cached so home `ContinueReadingCard` shows the same % the reader footer did. 30 unit tests including monotonicity invariant and infinite-scroll boundaries.
- **App relaunch lands on home after long background** ([`1d81cf7`](https://github.com/mrviduus/textstack/commit/1d81cf7)) — `ColdResetOnResume` component (isolated so `usePathname` re-render is scoped) calls `router.replace('/')` after 30 min of background, UNLESS user was in `/reader/*` or `/my-books/read/*` (Kindle model: reading sessions are intentional, resume them; transient nav resets fresh). Fires `app_resumed_from_background` analytics event with PII-safe `bucket_minutes` + `path_prefix` for post-launch dashboard debugging.
- **`pickContinueReadingBook` extracted + tested** ([`1d81cf7`](https://github.com/mrviduus/textstack/commit/1d81cf7)) — was the most complex code in `ContinueReadingCard.tsx` (4-source LWW merge, mixed timestamp formats). Now pure function in `@textstack/shared/reader/continueReading.ts`. 26 hand-crafted + 5 property-based tests (1000+ cases) covering catalog/user-book mixes, grace window, malformed timestamps. Catalog books that aren't in library never picked; finished books never picked; result.updatedAtMs always = max of valid items. Found a real bug in the process: `Date.parse('garbage')` returned NaN that silently leaked through `=== 0` checks → fixed via `parseEpochMs()` helper accepting both ISO string + epoch number.
- **`parseScrollLocator` shared parser** ([`1d81cf7`](https://github.com/mrviduus/textstack/commit/1d81cf7)) — two inline `split(':')` parsers in the readers would break on chapter slugs containing `:` (possible for user-uploaded EPUBs with titles like "Chapter 1: Introduction"). New parser in `@textstack/shared` splits from the right via `lastIndexOf`, strict-digit regex on offset, round-trip property-tested. 20 tests covering happy path, multi-colon slugs, malformed inputs.
- **`useUserBookProgress` + `useFlushOnBackground`** ([`1d81cf7`](https://github.com/mrviduus/textstack/commit/1d81cf7)) — sibling hook to `useReaderProgress` with identical contract (`saveProgress` / `bumpProgress`). Removes ~80 LOC of inline save logic from user-book reader. `useFlushOnBackground(flush)` factored out the Android OS-kill mitigation (AppState background → flush) both readers shared, now with reentry guard + try/catch so a buggy flush doesn't detach the AppState subscription. Critical for Android (current launch focus) where the OS evicts apps without running React cleanup.
- **ADR-011** ([`1d81cf7`](https://github.com/mrviduus/textstack/commit/1d81cf7)) — `docs/01-architecture/adr/ADR-011-mobile-reader-progress-architecture.md` documents the platform priority (Android first), book-progress single-source-of-truth strategy (client-side, no backend changes needed for multi-device consistency), and the sibling-hooks-not-polymorphic-hook decision. References Android Doze, RN AppState, Expo Router state docs.

### PDF content quality — Claude cleanup pipeline (2026-05-22)

Slices 1-4 of feat-0007 (`docs/05-features/feat-0007-pdf-content-quality.md`).
Makes PDF-extracted books readable: heuristics get ~70-75%, the gap to ~90% is
semantic (running headers in body, fragmented paragraphs, hyphenation, inlined
footnotes). Closes it with a gated Claude cleanup pass, and logs every fix so
the deterministic heuristics can ratchet up over time. Marker (ML PDF pipeline)
was evaluated and shelved — the prod GPU's 4 GB VRAM can't hold its model set.

- **`ChapterContentQualityAnalyzer`** — deterministic 0-100 content-quality
  score + issue codes (fragmented paragraphs, running headers in body,
  unmerged hyphenation, orphan page numbers, inlined footnotes) for extracted
  chapter HTML. Pure C#, 12 unit tests. The gate that decides which chapters
  warrant an LLM pass.
- **Score persisted at ingest** — `ContentQualityScore` column on `Chapter` +
  `UserChapter`, set in both ingestion paths; `BookQualityJob` carries Phase 3
  tracking counters. Worker logs a per-book score distribution.
- **`quality-poll.sh` Phase 3** — for each chapter below the quality threshold,
  Claude CLI fixes structure (preserving content verbatim); a stdlib-only
  preservation gate (`pdf-cleanup-gate.py`) rejects hallucination or
  over-deletion via word-multiset diff before the cleaned HTML is written back.
  Every (messy → clean) pair is logged to `data/pdf-cleanup-dataset/` as fuel
  for the future heuristic ratchet. Off by default — `CONTENT_CLEANUP_ENABLED`.
- **Admin observability** — the Book Quality job detail panel shows Phase 3
  results (chapters cleaned / rejected / skipped).

### Mobile reader — autosave restore (2026-05-13)

- **WordCard parity with web WordPopup** — single-word tap on mobile
  showed a manual "+ Save" CTA even though `autoSaveWord` already fires
  on selection. Confusing: identical action surfaced as both implicit
  (auto-save) and explicit (button). Web's `WordPopup` has no Save
  button — `isSaved` is derived from `vocabMap`. Removed the "+ Save"
  CTA from `apps/mobile/src/components/WordCard.tsx`; auto-save remains
  the only path. Also patched `useReaderVocabActions.autoSaveWord` to
  flip `wordSaved=true` on `already_saved` outcome so the popup shows
  "✓ Saved to vocabulary" instead of an empty actions row when the
  server reports the word was already in vocab but `vocabMapRef` was
  stale.
- **In-chapter scroll restore on chapter load** — mobile reader was
  saving `{chapterSlug, percent}` to AsyncStorage and to the server, but
  never reading the percent back: every chapter mount put the user at
  scrollY=0 even when "Continue Reading" routed to the correct chapter.
  PWA-parity fix in `apps/mobile/app/reader/[bookSlug]/[chapterSlug].tsx`:
  on `(editionId, chapterSlug)` change, fetch `getLocalProgress` (local
  AsyncStorage, instant + offline-safe); fall back to
  `readingProgressApi.getProgress` for the cross-device case (read on web
  → open on phone). On WebView `onLoadEnd`, one-shot
  `requestAnimationFrame` → `window.scrollTo(0, scrollHeight * percent)`.
  One-shot guard prevents re-scrolling after settings tweaks rebuild the
  HTML and re-fire `onLoadEnd`. Caught in audit ahead of Play Store
  launch.

### Headline — Gemma 4 swap + the bugs it surfaced

Switching the local LLM from `qwen3:8b` to `gemma4:e4b` looked like a
five-minute model-name change. Behind it sat a chain of latent prod bugs
that only became visible once we started actually reading the saved
distractors/hints/explanations and the freshly enriched book metadata.
This `[Unreleased]` block tracks the swap **and** every follow-up fix that
landed before publishing the Gemma 4 Challenge write-up.

### Changed

- **Local LLM model**: switched from `qwen3:8b` to `gemma4:e4b`, then
  trimmed once more to `gemma4:e2b` after prod data showed CPU-only
  `e4b` inference was missing the 30 s timeout window on most requests.
  Both are Gemma 4 (challenge-condition preserved); `e2b` is the
  effective-2B MoE variant — 7.2 GB on disk vs 9.6 GB for `e4b`, ~2-3×
  faster inference on the same CPU. Quality on the
  distractor / hint / explanation prompt is comparable for short
  single-word outputs; will measure on prod 1-2 days post-swap. Same
  `ILlmService` interface, no API changes. To roll back to `e4b`:
  override env `Ollama__Model=gemma4:e4b`.
- **Ollama container**: image pinned to `ollama/ollama:0.23.1` (the floating
  `latest` tag was still serving 0.22.x which doesn't recognise the
  `gemma4` family). Memory limits raised from 4G/2G to 12G/8G — `gemma4:e4b`
  needs ~9.8 GiB RAM to load weights + KV cache, `gemma4:e2b` needs ~5 GiB
  but we keep the 12G ceiling so swapping back to `e4b` is one env-var
  change away. Server has 31 GB total so the headroom is plenty.
- **Ollama `keep_alive=-1`**: PR #234 — keep the model resident across idle
  windows. Without this, a 5-minute lull (typical between two user-vocab
  saves) made every next save eat a 30-60s cold model load. `ollama ps`
  now consistently shows `UNTIL=Forever` for `gemma4:e4b`.
- **API + Worker Ollama timeout**: raised `Ollama:TimeoutSeconds` from
  `30` → `90` in both `appsettings.json`. Gemma 4 e4b on CPU-only takes
  >30 s for some prompts (especially first inference after a model load).
  At 30 s the API logged a 100% timeout rate for vocab enrichment; at 90 s
  the success rate climbs back to normal. Cost: cap on worst-case latency
  per word doubled, but enrichment is fire-and-forget so the user sees no
  difference. To roll back: revert this commit or override via env var
  `Ollama__TimeoutSeconds`.
- To roll back the model entirely: set `Ollama__Model=qwen3:8b` env var or
  revert the swap commit.

### Fixed

- **Worker couldn't reach Ollama** (`localhost:11434` instead of
  `http://ollama:11434`). `docker-compose.yml` had set `Ollama__BaseUrl`
  on the `api` service but not on `worker`, so every
  `BookMetadataGenerator` call from the worker hit `Connection refused`
  silently — every user-uploaded book ended up with `genre = NULL`, which
  in turn meant the domain-aware translation prompt had nothing to bias
  against. Fix: add `Ollama__BaseUrl` + `Ollama__Model` to the worker env
  block, mirroring the api block. Discovered by greping the worker logs
  during prod-stats collection for the Gemma 4 article — visible only via
  `docker compose logs worker | grep "Connection refused"`.
- **`MetadataBackfillWorker` (one-shot)**: new `BackgroundService` that
  on worker startup picks up to 50 user_books with `Status=Ready AND
  Genre IS NULL`, runs `BookMetadataGenerator` against each (2 s gaps),
  and writes the result back. Heals the ~10 books that were ingested
  while the worker was pointing at the wrong host. Idempotent —
  re-running on a healthy DB is a no-op.
- **`/api/explain` returned 404**: client called `${API_BASE}/api/explain`
  but in prod `API_BASE='/api'`, so the URL became `/api/api/explain`.
  Translation got away with the same bug because it has a `/translate`
  compat route on the backend; Explain didn't. Fix in
  `apps/web/src/api/explain.ts` and `dictionary.ts`: drop the redundant
  `/api/` prefix. Backend `Map("/explain")` route untouched.
- **Domain-aware tap-on-word translation**: `TranslateRequest` now
  accepts optional `BookId` / `Sentence` / `Genre`. Backend mirrors
  ExplainEndpoints to resolve genre from `Editions` then `UserBooks`,
  fails soft if neither exists. Prompt biases toward the
  domain-specific reading and asks for a short parenthetical clarifier
  in the target language (the README's "увага (механізм у нейромережах)"
  pattern). Cache key now includes genre + sentence so a CS-context
  translation of "polling" doesn't poison the cache for the same word
  in a news-context query.
- **EPUB titles like `"Designing Data-Intensive Applications (for )"`**:
  O'Reilly Atlas templates ship `dc:title` with `(for ${atlas.author_email})`;
  some retail pipelines strip the variable but leave the parens. New
  `BookTitleCleaner` utility (`backend/src/Extraction/.../Utilities/`)
  removes the trailing parenthetical when its content is empty,
  whitespace-only, a known template syntax (`${var}`, `{{var}}`, `$var`,
  `%var`), or any combination of Unicode formatting chars (ZWSP, ZWJ,
  BOM, NBSP, soft hyphen, embedding controls). Wired into Epub/FB2/PDF
  extractors. 26 unit-test cases covering real-world variants.
- **Migration `\b` bug — PostgreSQL doesn't treat `\b` as a word
  boundary**: V1 and V2 of `CleanUserBookTitles` used `\b` inside the
  SQL regex assuming Perl/PCRE semantics. PostgreSQL's Advanced Regex
  Engine treats `\b` as backspace (`U+0008`), so the migrations
  silently no-op'd against actual `(for )` titles in prod. Verified
  with:

  ```sql
  SELECT 'X (for )' ~ '\(\s*for\b\s*\)\s*$';  -- false (!)
  SELECT 'X (for )' ~ '\(\s*for\s*\)\s*$';    -- true
  ```

  V3 migration (`20260511012517_CleanUserBookTitlesV3`) drops the `\b`
  entirely — the surrounding parens already pin "for". The clean-up
  finally applied retroactively on deploy.
- **Translate cache permission**: `/data/translate-cache` was mounted
  root-owned (uid 0) while the api container runs as uid 1000. Every
  cache write logged EACCES (translation worked but nothing got cached).
  `Makefile` `fix-permissions` target gains the `translate-cache` dir;
  GitHub Actions deploy workflow now runs `make fix-permissions` before
  `docker compose up`. Idempotent, adds ~1 s per deploy.

### Production snapshot (collected for the article)

Read-only data pull from prod 2026-05-11 ahead of publish, after the
`Connection refused` worker bug got patched but before the timeout bump
landed:

- **Words saved since the Gemma 4 swap (2026-05-07 → 2026-05-11):** 13.
- **Of those, Gemma-generated `Distractors` / `Hint` / `Explanation`:** 2
  each. The other 11 hit the 30 s Ollama timeout and fell through to the
  random+hardcoded distractor fallback (no hint, no explanation).
- **Average distractors per generated word:** 4.5 (range 4–5; target 5).
- **Time window since swap:** 70.4 hours.
- **Ollama uptime:** the model was resident the entire time (`ollama ps`
  showed `UNTIL=Forever` consistently) — every miss was a wall-clock
  timeout, not a cold-load.
- **One real (word, distractors) pair worth quoting in the article:**
  `warehouse → ["storeroom", "depot", "facility", "silo", "loft"]`. Five
  domain-adjacent single-word distractors, exactly the shape the prompt
  asks for.
- **One real example of the prompt working in context:** Explain on
  *Designing Data-Intensive Applications*, ETL phrase, target Spanish,
  produces a 2-3-sentence explanation with a concrete analogy ("Es como
  recoger ingredientes de varias tiendas, prepararlos y luego guardarlos
  en una despensa lista para cocinar."). That clip is `docs/demo.gif`.

After the 30 s → 90 s timeout bump + worker URL fix, success rate is
expected to climb to ~100 %. Will re-measure after a deploy cycle and
post the delta in the article body.

### Punchline — Gemma 4 thinking mode was eating the answer

The real root cause behind the 2/13 success rate wasn't the timeout
or the Ollama URL. It was **thinking mode**. Direct probe on prod:

```text
$ ollama run gemma4:e2b "Reply EXACTLY: GENRE: <...>\nYEAR: <...>..."
Thinking...
Thinking Process:
1. **Analyze the Request:** The user provided a context...
2. **Analyze the Constraint:** The instruction is to "Reply EXACTLY..."
...
```

Gemma 4 (both `e4b` and `e2b`) is a reasoning model. Every call emits
a long chain-of-thought preamble before the answer. With
`num_predict=600` (our cap for `DistractorGenerator` /
`BookMetadataGenerator`), the thinking budget ate the whole window
and the response we tried to parse contained no `GENRE:` /
`DISTRACTORS:` / `HINT:` / `EXPLANATION:` lines — every fire-and-
forget enrichment returned null. The 2 successful calls in the
2/13 sample? Pure luck — those prompts happened to finish thinking
inside the token budget.

Fix: pass `think: false` in the `/api/generate` body. Ollama 0.6+
supports the flag for thinking-capable models; non-thinking models
silently ignore it. One JSON field, four lines of code:

```csharp
var request = new
{
    model = _model,
    prompt,
    stream = false,
    think = false,    // ← this one
    options = new { num_predict = maxOutputTokens },
};
```

### Production numbers, after `think: false` (re-collected 2026-05-11)

| Metric                        | Before (no `think:false`) | After (`think:false`) |
|-------------------------------|---------------------------|-----------------------|
| Enrichment success rate       | 2 / 13 = **15 %**         | 12 / 12 = **100 %**   |
| Per-call inference time       | 90 s → **timeout**        | 0.6 s eval / 1.5 s total |
| Tokens emitted per call       | ~600 (capped, all thinking) | **13**              |
| CPU burn per 5 saves          | 5–8 min of 100 % CPU      | ~7.5 s of 100 % CPU   |
| `MetadataBackfillWorker` run  | enriched = 0 / 6          | enriched = 6 / 6      |

Real (word → distractors) samples written by Gemma 4 e2b after the
fix, harvested from `vocabulary_words`:

```
were    → ["was", "is", "am", "be", "had"]
without → ["lacking", "except", "beyond", "unless", "besides"]
warehouse → ["storeroom", "depot", "facility", "silo", "loft"]
```

Clean, single-word, semantically adjacent, no synonyms. Exactly the
shape `DistractorGenerator.BuildPrompt` asks for. The hint sentences
and per-word Russian explanations land equally well — full samples in
the article body.

CPU temperature on the prod box (Ryzen 5 4600H, no GPU) sits at ~43 °C
idle, peaks at ~71 °C during a 5-word burst, falls back inside a
minute. Throttle threshold is ~95 °C; we're nowhere near it.

### Also fixed in the same pass

- **SSG worker zombie pile-up** — Puppeteer was leaving `<defunct>`
  Chromium + `chrome_crashpad` children every prerender (28 + 28 = 56
  observed on the host). Added `init: true` to the `ssg-worker`
  service in `docker-compose.yml`; Docker now runs `tini` as PID 1 to
  reap SIGCHLD'd children. Zero behaviour change in SSG output, just
  keeps the process table from drifting toward PID exhaustion.
- **OpenTelemetry CVEs** — bumped `OpenTelemetry.Api` /
  `OpenTelemetry.Exporter.OpenTelemetryProtocol` / instrumentation
  packages from 1.11.x to 1.15.3 (stable). Clears GHSA-4625-4j76-fww9
  and GHSA-g94r-2vxg-569j. `dotnet list package --vulnerable` now
  reports zero hits across the solution.

### Discovery — there's a GPU on prod, it was sitting idle

Pulling system info for the load-test bottleneck section surfaced a
discrete GPU the deployment never actually used:

```
$ lspci | grep -iE 'vga|3d'
01:00.0 NVIDIA Corporation TU117M [GeForce GTX 1650 Ti Mobile]
05:00.0 AMD [Radeon RX Vega 6 ...]
$ nvidia-smi --query-gpu=name,memory.used --format=csv
NVIDIA GeForce GTX 1650 Ti, 5 MiB
```

The 1650 Ti is a 4 GB-VRAM mobile-class card — small for an LLM —
but with `gemma4:e2b` taking ~7.2 GB on disk, even **partial GPU
offload** (half the layers on GPU, half on CPU) is meaningfully
faster than the pure-CPU baseline we'd been measuring.

What was missing:
- `nvidia-container-toolkit` on the host (Docker had no `nvidia`
  runtime — `docker info` showed only `runc`)
- `runtime: nvidia` + a `gpu` device reservation on the ollama
  service in `docker-compose.yml`

Wired both in this pass. Host bootstrap is one-shot via
`scripts/loadtest/install-nvidia-toolkit.sh` (idempotent — installs
the toolkit if absent, registers the runtime with dockerd, runs a
`nvidia/cuda` smoke container to verify the GPU shows up inside). The
compose change deploys via GH Actions like everything else.

Smoke verification on prod after the toolkit install:

```
$ docker run --rm --gpus all --runtime=nvidia nvidia/cuda:12.2.0-base nvidia-smi -L
GPU 0: NVIDIA GeForce GTX 1650 Ti (UUID: GPU-60920952-b37a-b82f-...)
```

Capacity caveat baked into the compose comment: 4 GB VRAM vs 7.2 GB
model = partial offload. Realistic speedup vs pure CPU: **2–3×**, not
the ~10× a full-offload datacenter card would give. Even so, every
factor matters when one user heating a laptop CPU is the current
ceiling.

Rollback is trivial — drop `runtime: nvidia` and the `devices` block
and redeploy. Ollama silently goes back to CPU.

Follow-up micro-benchmark (`scripts/loadtest/bench-ollama.sh`,
5 distractor-shape prompts × 2 modes via `num_gpu: 0` vs let
Ollama auto-split):

| Metric | CPU only | GPU hybrid 26 % | Δ |
|---|---:|---:|---:|
| Avg output tokens | 60 | 55 | ~same |
| Avg eval latency | 3 506 ms | 1 411 ms | **2.49× faster** |
| Avg total latency | 5 390 ms | 2 174 ms | **2.48× faster** |
| Tokens / sec | 17 | 39 | **2.29× faster** |

In product terms: a fire-and-forget vocab save enrichment goes
from ~5.4 s to ~2.2 s; a burst of five saves goes from ~27 s of
pure-CPU heat to ~11 s of mixed CPU/GPU. Peak CPU temp during
the same burst dropped from 71 °C to ~60 °C. Full report +
NDJSON: `docs/loadtest/bench-20260512-140841/REPORT.md`.

### Load test — 2026-05-11

First end-to-end load run after the `think:false` deploy. Driven by
`scripts/loadtest/run.sh`: SSH-tunnel into `asus:127.0.0.1:8080`
(bypasses nginx so a single laptop can saturate the box), pre-warm
translate + explain disk caches with 10 fixed inputs (one-off
$0.002 OpenAI), then 50 / 50 / 30 VU bursts against `/health` /
cached `/api/translate` / cached `/explain`. Server-side metrics
collected via `scripts/loadtest/collect-metrics.sh` (vmstat /
thermal / docker stats / `ollama ps`).

Full report + raw artifacts: `docs/loadtest/run-20260511-103451/`.

| Scenario       | VU | Duration | Requests | Success | RPS    | p95     |
|----------------|---:|---------:|---------:|--------:|-------:|--------:|
| smoke `/health`| 50 | 30 s     | 15 000   | 100 %   | 500.0  | 20.5 ms |
| translate cached | 50 | 60 s   | 30 000   | 100 %   | 500.0  | 18.5 ms |
| explain cached | 30 | 60 s     | 18 000   | 100 %   | 300.0  | 18.4 ms |

Box stayed almost cold: idle 38 °C → burst 42 °C → cooldown 39 °C
(throttle threshold is 95 °C). System-wide CPU peaked at 12 %; only
the API container worked, peaking at **71 % CPU** under the smoke
run — that is the next ceiling. No memory growth, no rate-limiter
spillover, no disk delta (all cache hits). OpenAI calls during the
stress phase: **0**. 63 000 requests served, zero failures.

### Up next — load testing with LoadSurge

The single-user prod numbers above are honest but limited; "100 readers
all save a vocab word at the same instant" is the next failure mode to
prove or disprove. Plan: a small .NET load harness on top of
[LoadSurge](https://github.com/mrviduus/LoadSurge) (in-house actor-based
load runner, `dotnet add package LoadSurge`). Same language as the
backend, so the test plan lives in the repo and exercises the real
`VocabularyEndpoints.SaveWord` path with a realistic concurrency curve
(ramp 0 → 100 VU over 30 s, hold 5 min). What we want from the run:

- p50 / p95 / p99 translation latency under load (OpenAI-bound — should
  stay flat).
- Distractor success rate under load (Ollama-bound — the interesting
  number, given the single CPU serialises every inference).
- Ollama timeout count vs the post-swap baseline above.

If distractor success craters under concurrency, the fix is a bounded
background queue (`Channels` or Polly bulkhead, `MaxConcurrency=2`) plus
a per-`(word, language)` distractor cache — write once, reuse for every
later user who saves the same term. Translation already has the disk
cache; distractors will get the same treatment.

## [v0.1.0] — 2026-05-06

### Headline

First tagged release of TextStack under **GNU Affero General Public License v3.0**. Earlier development was BUSL-1.1; v0.1.0 onwards is AGPL-3.0 (PR #201). See `release-notes-v0.1.0.md` for the user-facing announcement.

### Library + Mobile parity wave (2026-05-05)

Web library got the duplication / discoverability fixes that surfaced once a real user (mrviduus, 26 uploads) started actually living in it. Mobile then absorbed every web change so iOS/Android shipped in the same shape — no more drift between platforms.

#### Web
- **Shelf "View all →" → dedicated page** ([#203](https://github.com/mrviduus/textstack/pull/203), [#204](https://github.com/mrviduus/textstack/pull/204)) — Continue reading / Recently added / Finished this month each render at `/library/shelf/:id` with the full grid instead of vanishing into a query-string filter.
- **Saved + Uploads merged on /library** ([#204](https://github.com/mrviduus/textstack/pull/204)) — single search, single status-tabs (combined counts), single sort, single grid. Combined merge-sort interleaves both lists; processing/failed uploads pin to top.
- **Add to collection on book detail pages** ([#204](https://github.com/mrviduus/textstack/pull/204)) — new `<AddToCollectionButton>` with `menu` and `button` variants. Wired into kebab, classic detail (when in library), and user-upload detail (when ready).
- **`BookDetailHero` extracted** ([#203](https://github.com/mrviduus/textstack/pull/203)) — cover/title/author/description/meta/actions slots shared by classic and user-upload detail pages. Eliminates the previous duplicate hero markup.
- **Saved cards finally show author** ([#204](https://github.com/mrviduus/textstack/pull/204)) — backend `LibraryItemDto` projects joined author names; combined sort/search use the field; cards render it under the title.
- **Collection sidebar filter applies to both saved + uploads** ([#204](https://github.com/mrviduus/textstack/pull/204)) — parallel fetch of both book-id sets so a single collection click filters everything in unified mode.
- **`status='all'` is the new default** ([#205](https://github.com/mrviduus/textstack/pull/205)) — fresh `/library` no longer applies a hidden Reading filter that silently hid Not-started + Finished books. Sidebar count and grid count finally match.
- **UX polish round 1** ([#218](https://github.com/mrviduus/textstack/pull/218)) — clicking a collection smooth-scrolls to the grid (was an invisible-above-fold change), active chip uses inverted bg/fg + bold + small shadow for Apple-grade visibility in light mode, and Add-to-collection on detail pages becomes a 36×36 circular `+` icon next to share/copy instead of a third giant pill.
- **UX polish round 2** ([#219](https://github.com/mrviduus/textstack/pull/219)) — sidebar is the canonical "+ New collection" entry (chip-row duplicate removed); empty-state chip-row hides entirely; status tabs become `position: sticky` so the active filter stays visible while scrolling a long grid.
- **UX polish round 3** ([#220](https://github.com/mrviduus/textstack/pull/220)) — sticky offset is now `top:80` to match `.site-header` height (no overlap during the collapse animation); destructive `Delete Book` moved out of the primary action row into a quiet "danger zone" text-link below the chapters list (Apple HIG: distance + understatement for destructive actions).
- **UX polish round 4** — Add-to-collection popover gains an inline "+ New collection" form (Apple Notes pattern; no extra dialog); icon buttons get an instant custom CSS hover tooltip instead of the 1-2s delayed native `title=""`; "Delete this book" in the danger zone is now a circular trash icon button matching the `+` icon pattern across the page.
- **UX polish round 5** — drop duplicate `title=""` on icon buttons that already use `aria-label` + custom CSS tooltip (was rendering two tooltips on hover — native after 1s on top of the custom one). Empty-state hint now flows through `aria-label` so the same single tooltip surfaces "Create a collection in the sidebar first" via the custom path.
- **UX polish round 6** — tooltip wraps on narrow viewports. `white-space: nowrap` was clipping the longer empty-state hint at the right edge on phones; now `white-space: normal` + `max-width: min(220px, 100vw - 24px)` keeps it readable across breakpoints. Same fix applied to the delete-icon tooltip.
- **UX polish round 7** — popover state resets on close. Click-outside / Esc / successful pick all flip `expanded:false`, but the `creatingNew` + `newName` state from the inline "+ New collection" form persisted across closes — re-opening landed straight into the input with stale text. Added a small effect that clears both whenever `expanded` becomes false.
- **UX polish round 8** — empty-state pop-over creates inline. Previously `collections.length === 0` made the icon button disabled with a tooltip telling the user to walk over to the sidebar. With the inline create form already living in the popover, that detour was needless: clicking "+ " in empty state now skips the (empty) list and lands directly in the create input.
- **UX polish round 9** — drop dead-code empty-state hint and harden the open-toggle. The grey hint added in round 8 was conditioned `isEmpty && !creatingNew` but the click handler set `creatingNew=true` synchronously on every empty click, so the hint never rendered. Removed the JSX + CSS for it. The click handler now only flips into create-mode when *opening* the popover (was running on close too — harmless but messy).
- **UX polish round 10** — mobile sheet resets on external visibility change. `AddToCollectionSheet` only ran reset() inside its own `handleClose` — when a parent flipped `visible:false` for any other reason (route change, focus loss, programmatic dismiss), `creating` and `newName` persisted into the next open. Same single-effect-on-visible pattern as the web popover (#224).
- **UX polish round 11** — web sidebar drawer mirrors the same reset. `LibrarySidebar` stays mounted and toggles via CSS, so the inline "+ New collection" form state survived re-opens on mobile-shaped viewports. Added a `drawerOpen` prop + effect that clears `creatingCollection` + `newCollectionName` whenever the drawer hides. Desktop sidebar is always visible, so the prop is undefined there and the effect no-ops.
- **Removed 4 unused SEO landing pages** ([#217](https://github.com/mrviduus/textstack/pull/217)) — `/learn-english-{brazil,spain}`, `/read-books-in-english`, `/books-with-translation` plus their components/CSS/routes/sitemap entries/nginx blocks. Not linked, not in sitemap, no traffic signal, three-week stale, and Brazil/Spain shipped with mixed-language UX. ~650 LOC, 23KB JS+CSS gzipped removed.

#### Mobile (iOS + Android)
Same arc, same scope — every web change ported. Shipped over OTA via EAS Updates so existing app installs picked everything up on next launch without a Store rebuild.

- **`DEFAULT_STATUS = 'all'`** ([#206](https://github.com/mrviduus/textstack/pull/206)) — mirror of #205. iOS/Android library now opens with the full collection, not the Reading-only subset.
- **Author on saved cards + sort** ([#207](https://github.com/mrviduus/textstack/pull/207)) — shared `UserLibraryItem` type gains `author`, sortLibraryItems handles author with the same null-rules as uploads, both grid and list views render the author line under the title.
- **Collections support** ([#208](https://github.com/mrviduus/textstack/pull/208)) — shared `collectionsApi` (list/create/update/delete + add/remove/getBookIds). New `useCollections` hook (60s cache + subs). New `<AddToCollectionSheet>` bottom-sheet picker. `useBookActions` accepts `onAddToCollection`; both action sheets prepend it. Detail pages get an "Add to collection" button.
- **Shelf "View all" screens** ([#209](https://github.com/mrviduus/textstack/pull/209)) — `/library/shelf/[shelfId]` route renders a full grid of any shelf; carousel headers gained the link.
- **Sidebar collections section + filter** ([#210](https://github.com/mrviduus/textstack/pull/210)) — drawer renders the user's collections under the source tabs; tapping one filters both saved and uploads in parallel.
- **Auto-refetch on cache invalidation** ([#211](https://github.com/mrviduus/textstack/pull/211), [#212](https://github.com/mrviduus/textstack/pull/212)) — adding a book to the active collection now re-fetches the membership immediately. Implemented via a versioned subscription that landed first as a hand-rolled hook then rewrote on `useSyncExternalStore` for tear-free concurrent reads.
- **EAS Updates wired up** ([#213](https://github.com/mrviduus/textstack/pull/213), [#214](https://github.com/mrviduus/textstack/pull/214)) — `runtimeVersion: { policy: "appVersion" }` + `updates.url` pointing at the existing EAS project. `eas update --platform all` now ships JS-only changes to existing apps without a binary rebuild.
- **Web shim for offlineDb** ([#215](https://github.com/mrviduus/textstack/pull/215)) — `apps/mobile/src/lib/offlineDb.web.ts` no-op stubs unblock `eas update --platform all`. expo-sqlite was pulling its `.wasm` import into the web bundle and crashing the export.
- **dist-web/ added to .gitignore** ([#216](https://github.com/mrviduus/textstack/pull/216)) — prevents test-export artefacts from being committed.



Complete rebuild of the user-owned books experience. From "upload buried 4 clicks deep" to a Kindle-class library with tags, collections, full-text search, AI assistance, and command palette. 20 slices shipped behind feature flags then enabled all-on after stable rollout.

#### Upload UX
- **Persistent upload button in header** ([`28a377c`](https://github.com/mrviduus/textstack/commit/28a377c)) — `+ Upload book` button now lives in the main header on every page; Cmd+U opens the modal from anywhere. Cuts upload from 4 clicks to 1.
- **Drag-and-drop anywhere on web** ([`1592991`](https://github.com/mrviduus/textstack/commit/1592991)) — drop an EPUB / PDF / FB2 onto any page and the upload modal opens with the file pre-loaded. Matches the Notion / Linear / Slack pattern modern users expect.
- **Library empty state is now an active drop zone** ([`d7ec6bb`](https://github.com/mrviduus/textstack/commit/d7ec6bb)) — first-run users see a large drop-zone CTA instead of a passive "no books yet" message. The empty state now teaches the upload action by demonstrating it.

#### Library
- **Continue Reading shelf at the top of Library** ([`34d818e`](https://github.com/mrviduus/textstack/commit/34d818e)) — last-opened books appear as a horizontal shelf so resuming is one tap, not a scan of the grid. The #1 reason users open Library now has a one-tap path.
- **Cover grid with progress and status badges** ([`34d818e`](https://github.com/mrviduus/textstack/commit/34d818e)) — bigger covers, percent-read printed on the cover, and Reading / Finished / Processing / Failed badges that read at a glance. Brings the grid up to Kindle quality.
- **Five-option sort menu** ([`35747c2`](https://github.com/mrviduus/textstack/commit/35747c2)) — Recently opened (default), Recently added, Title, Author, Progress. Replaces the limited 3-option control and matches Kindle / Calibre conventions.
- **Filter chips for reading state** ([`35747c2`](https://github.com/mrviduus/textstack/commit/35747c2)) — All / Reading / Finished / Not started / Failed chips above the grid. Users with 20+ books can now scope to "what am I reading right now" without scrolling.
- **In-library search by title and author** ([`35747c2`](https://github.com/mrviduus/textstack/commit/35747c2)) — search bar filters the grid live as you type. At 50+ books, recall beats browsing.
- **Unified per-book action menu** ([`35747c2`](https://github.com/mrviduus/textstack/commit/35747c2)) — single `BookActionMenu` replaces the two drift-prone menus (saved vs uploaded). Adds Mark finished / unfinished and creates the surface for slices 11+.

#### Power features (tags, collections, search, stats)
- **Editable book metadata** ([`1e74a6a`](https://github.com/mrviduus/textstack/commit/1e74a6a)) — modal to fix title, author, language, genre, and description on uploaded books. Respects user agency when LLM enrichment guesses wrong.
- **Free-form tags on uploaded books** ([`a35ec67`](https://github.com/mrviduus/textstack/commit/a35ec67)) — attach multiple tags (`fantasy`, `for-work`, `2026-reading-list`), filter by tag, and use `tag:` syntax in search. Power-user organization Kindle's collections cannot do.
- **Collections — named shelves** ([`cb255ec`](https://github.com/mrviduus/textstack/commit/cb255ec)) — create shelves like "Summer reading" or "Russian classics" and put books in many at once. Complements tags: tags are facets, collections are intentional groupings.
- **Bulk select + bulk actions** ([`d7b6c6b`](https://github.com/mrviduus/textstack/commit/d7b6c6b)) — multi-select books and apply Mark finished, Add to collection, Add tag, or Delete in one go. Necessary for hygiene at 30+ books.
- **Per-book personal stats page** ([`3f2419e`](https://github.com/mrviduus/textstack/commit/3f2419e)) — book detail now shows hours read, words encountered, vocab saved from this book, highlights count, sessions, and current pace. The data Kindle does not give you.
- **Full-text content search across uploads** ([`e2830ca`](https://github.com/mrviduus/textstack/commit/e2830ca)) — opt-in toggle extends Library search into chapter content via PostgreSQL FTS. "I remember a passage about X" now has an answer.

#### AI + polish
- **AI auto-tag suggestions via Ollama** ([`c3c6d3f`](https://github.com/mrviduus/textstack/commit/c3c6d3f)) — after ingestion, Ollama proposes 3–5 tags from title, author, and the first chapter; one click to accept. Removes the friction of manual tagging from slice 12.
- **Cmd+K command palette** ([`b0f1c74`](https://github.com/mrviduus/textstack/commit/b0f1c74)) — search-driven palette to jump anywhere or run any action in one keystroke. Standard pattern in Linear / Raycast / GitHub — devs and students will recognize it.
- **Reading time estimate per book** ([`9701567`](https://github.com/mrviduus/textstack/commit/9701567)) — "~3h 20m left" on cards and detail pages, computed from the user's actual pace, not a generic 200 wpm. Tiny touch, big perceived smarts.
- **Library stats dashboard strip** ([`391ff64`](https://github.com/mrviduus/textstack/commit/391ff64)) — compact monthly snapshot at the top of Library: pages this month, current streak, goal progress. Surfaces the value of staying in TextStack without forcing users into the Stats page.

#### Cleanup
- **Slice 99 — drop feature flags** ([`08d9de8`](https://github.com/mrviduus/textstack/commit/08d9de8)) — removed 19 flag references and `features.ts`. Features now always-on. Roadmap closed.

### SEO Backfill Automation (2026-04-14)
- **ADR-010** — `docs/ADR-010-seo-backfill-automation.md` describes architecture.
- **Editable prompt templates** — admin panel CRUD (per entity_type × field_type × language), version-frozen on edit.
- **DB-backed queue** — `seo_backfill_jobs` with atomic `FOR UPDATE SKIP LOCKED` claim.
- **Separate systemd poller** — `seo-backfill-poller` (does not mix with `seo-publish-poller`). Setup via `make seo-backfill-setup`.
- **Claude CLI generation** — JSON schema validation with 3 retries on invalid output.
- **Before/After snapshots** — full revert support even after success.
- **Coverage dashboard** — Author/Edition/Genre gap tracking per FieldType.
- **Review gate** — default ON, progressive trust via `trust_level` (manual → review → auto). Strictest wins for multi-field jobs.
- **`seo_source` column** — `manual` | `auto` | `hybrid` on Author/Edition/Genre/BlogPost; auto-skip entities marked `manual`.
- **Prompt injection guard** — `SeoPromptSanitizer` strips role markers (`assistant:`, `system:`) and template delimiters.
- **Admin UI** — `/seo-backfill` with Coverage, Templates, Jobs, Settings tabs.
- **Deploy** — `deploy.yml` restarts `seo-backfill-poller` post-deploy; Makefile `make deploy` mirrors.
- **Deprecates** `docs/seo-content-task.md` manual tracker — migrate to `/seo-backfill`.

### Practice & Review UX Improvements (2026-04-08)
- **Flashcards default mode** — classic flashcards now first and default (was Blitz)
- **Retry wrong words** — optional "Retry wrong words (N)" button on session summary to re-practice mistakes
- **Practice always available** — button never disabled, backend `includeAll` serves non-due words when queue empty
- **Real-time streak badge** — progress ring updates live during review via custom event + optimistic UI
- **Streak goal = 10 words** — progress ring fills to 10, turns green when goal met, amber while in-progress
- **No negative messaging** — removed "keep practicing" tier, lowest is now "Great work!" even at 0%
- **Twemoji flags** — replaced Unicode emoji flags with Twemoji CDN SVGs (fixes Windows rendering)
- **Dark mode badge fix** — explicit colors instead of CSS vars that blended with dark background
- **Popup flicker fix** — outside-click handler uses container ref to avoid toggle race condition
- **No-cards redirect** — review page redirects to practice instead of showing dead-end empty state
- **Vocabulary table on practice page** — shows all words sorted by due date (was "reviewed today" only)
- **Refactor** — removed redundant `NativeLang.flag` field, deduplicated banner/label logic

### Vocabulary Review Overhaul (2026-04-06)
- **Blitz + Classic modes** — segmented control on Practice page, Blitz (MC cards) and Classic (3D flip flashcards with self-assessment)
- **Classic Flashcards** — CSS 3D flip animation, self-assessment buttons (Forgot/Almost/Knew), maps to SRS isCorrect
- **New Word intro card** — shown for stage=0 words before quiz: word, sentence, translation, AI explanation
- **AI explanation** — Ollama generates 2-3 sentence explanation in native language when word saved, shown on NewWordCard
- **Sound effects** — Web Audio API synthesized sounds (correct/wrong/flip/complete), toggle in review header
- **Session summary redesign** — reward banner (4 tiers), stats row, action buttons
- **Practice page redesign** — removed emoji icons, Apple-like card sections, mode selector
- **Dark mode fix** — replaced undefined CSS vars (`--color-surface`, `--color-hover`) with proper theme vars
- **Removed typing mode** — ContextCard deleted, context cloze now uses MC (backend returns `multiple_choice`)
- **Ollama model upgrade** — switched from `gemma3:4b` to `qwen3:8b` for better multilingual quality
- **Mobile: vocab review overhaul** — ported all web review changes to React Native
  - Blitz (MC) + Classic (FlashCard with 3D flip) modes
  - Haptic feedback (expo-haptics): correct/wrong/flip/complete
  - NewWordCard for stage=0 words, ReviewFeedback (mini/full), SessionSummary with reward tiers
  - Mode selector (Blitz/Classic toggle) on vocabulary index
  - Word list context snippets with bold word in sentence
  - MC fix: `correctOptionIndex` instead of string comparison
  - Removed dead code: ContextCard, fuzzyMatch, levenshtein, inline feedback/summary

### Auto Publish — Automated Book Publishing Pipeline (2026-04-02)
- **Auto-publish admin page** — configurable pipeline: Draft → SEO generation → publish, fully managed from admin panel
- **SEO generation via Claude CLI** — `seo-generate.sh` calls `claude-sonnet-4-6` to generate description, relevance, themes, FAQs for editions and authors
- **Polling daemon** — `seo-publish-poll.sh` (systemd) polls DB every 60s, processes queued jobs
- **Settings** — books/day (1–10), hour UTC, require review gate, language filter, enable/disable toggle
- **Priority queue** — admin can queue specific editions with priority, processed first regardless of schedule
- **Candidates view** — shows Draft editions ready to publish with SEO readiness indicators (D/R/T/F)
- **Internal publish endpoint** — `POST /internal/editions/{id}/publish` (Docker network only), triggers SSG automatically
- **SSG periodic rebuild settings** — moved from `appsettings.json` to admin panel (enable/disable, interval hours)
- **Integration tests** — 10 auth tests for all admin autopublish endpoints

### Admin Improvements (2026-04-01)
- **Publish/unpublish buttons** on author detail page
- **SEO readiness filter + badge** for editions & authors lists
- **Dashboard** — live stats, recent jobs, blog metrics
- **Default og:image fallback** for pages without cover

### User Features (2026-03-28)
- **Email/password auth** — register, login, forgot password flow
- **User profile** — avatar upload + name edit
- **Vocabulary fix** — typed recall mode no longer requires exact word typing
- **Selection toolbar fix** — word selection works correctly in reader

### Mobile App (2026-03-25)
- **Full PWA parity** — shared API refactor, offline reading, progress sync
- **Top bar fix** — render after WebView so icons visible
- **User book reader fix** — missing slug param in appendChapter

### CodeGen — AI Code Generation (2026-03-22)
- **CodeGen admin page** — describe a task, Claude Code implements it in iterative loop (Ralph pattern), creates PR
- **PDD auto-generation** — each job creates a Product Design Doc in `docs/05-features/codegen-{id}.md` on first iteration
- **Host-based execution** — uses Claude Code CLI with Max subscription (OAuth), runs on host via `codegen-poll.sh`
- **Rerun support** — restart terminal jobs with clean state
- **Hardening** — input validation, timeouts, double-click guard, branch checkout verification
- **Mobile-responsive admin** — hamburger menu, off-canvas sidebar, responsive tables/forms for all admin pages

### Vocabulary
- **Vocab review card** removed from homepage
- **Dark mode fix** — vocab review button invisible in dark mode
- **Button overflow fix** — vocab review card button on narrow screens

### SSG / SEO — Critical Fix (2026-03-12)
- **Fix: SSG saved error pages as permanent static files** — if API failed during prerender (timeout, 499), broken HTML with `noindex` was saved and served to Google. Now skips saving pages with `noindex` meta tag
- **Fix: detail pages treated all errors as 404** — created `errorUtils.ts` with `isNotFoundError()`. Only real HTTP 404 gets `noindex`; transient errors (499, timeout) no longer add `noindex`
- **Fix: Google JS hydration overwrites SSG** — strip `<script type="module">` and `<link rel="modulepreload">` from SSG output so Googlebot can't re-execute React
- **Fix: SSG worker blocked by AllowedHosts** — added Docker hostname `api` to `AllowedHosts` in `appsettings.json`
- **Fix: nginx served SSG to all users** — `if ($is_bot)` inside regex location broken ("if is evil"). Replaced with `map $is_bot $ssg_file` + `try_files` — bots get SSG, real users get SPA
- **Fix: Google Live Test got SPA instead of SSG** — `Google-InspectionTool/1.0` UA didn't match bot detection. Added to `map $http_user_agent $is_bot`
- **Fix: nginx sites-enabled was stale copy** — `sites-enabled/textstack` was a file, not symlink. Deploy now creates symlink via `ln -sf`
- **Retry logic** — failed routes retried up to 2x during SSG rebuild
- **Deploy SEO smoke test** — new CI step verifies `X-SEO-Render: spa` for real users, bot detection active, nginx bot map configured
- **Backup cleanup** — keep only 5 newest backups (deploy + scheduled), freed 37GB disk
- **Admin blog INTERNAL_ERROR** — all admin blog endpoints used `GetSiteId()` which throws on admin routes (SiteContextMiddleware skipped). Changed to `[FromQuery] Guid siteId` (PR #37)

### Blog
- **Full-stack blog** — admin CRUD, public pages, comments (2-level threaded), likes, share buttons
- **Admin panel** — create/edit/publish/unpublish, cover upload, stats, search, status/language filters
- **Web** — `/:lang/blog` list, `/:lang/blog/:slug` detail, Article JSON-LD, internal link interception
- **SSG** — prerender blog list + detail, `/sitemaps/blog.xml`, nginx location blocks
- **i18n** — en + uk translations, legacy URL redirects for `/blog`

### Vocabulary
- **Definition on review cards** — show dictionary definition below book sentence on all card types (MC, typed recall, context, feedback)

### TTS (Text-to-Speech)
- **Edge TTS integration** — direct WebSocket to `speech.platform.bing.com`, no deps, no API key
- **`TextStack.Tts`** — separate class library: `EdgeTtsClient` (WebSocket protocol), `EdgeTtsService` (disk cache + SemaphoreSlim)
- **API**: `GET /api/tts?text=&lang=&speed=` → MP3, `GET /api/tts/voices?lang=` → voice list
- **Two-layer cache** — server disk (SHA256 key, 30d TTL, 1GB limit) + client IndexedDB (30d TTL)
- **Vocabulary** — speak buttons on word list + all SRS cards (MC, typed recall, context, feedback)
- **Reader** — speak in SelectionToolbar, DictionaryPopup (word), TranslationPopup (source + translated)
- **Settings** — TTS speed in ReaderSettingsDrawer (0.75x – 2.0x)
- **Voices** — `en-US-AriaNeural` (en), `uk-UA-PolinaNeural` (uk), 200+ available
- **Tests** — 19 unit (EdgeTtsServiceTests), 11 integration (TtsEndpointTests), 6 E2E (tts.spec.ts)

### SEO Content — Full Coverage
- **654 authors** with full SEO (bio, relevance, themes, FAQs) — 100% of indexable authors
- **1,567 editions** with full SEO (description, relevance, themes, FAQs) — 100% of published editions
- **52 Ukrainian authors** — all with Ukrainian-language bios, themes, FAQs
- **~412 one-book English authors** — A–X alphabetical bulk generation
- **Priority authors**: Trollope (22), Wallace (19), Leblanc (12), Orczy (12), Norton (10)
- **73 two-book authors** + all 3+ book authors completed in earlier batches
- FAQ schema markup for rich snippets in search results

### Features
- **Authors pagination** — paginated author listing page
- **Header search fix** — query preserved on navigation
- **Reading progress** — cross-language library links, session reliability
- **i18n book detail** — all hardcoded English strings translated
- **EPUB fix** — handle self-closing `<script/>` in XHTML

### Content: OpenBook2 Ukrainian Library Import
- **220 EPUB books** imported from [OpenBook2](https://sites.google.com/view/openbook2) (public domain Ukrainian classics)
- **~50 Ukrainian authors** created — Франко, Шевченко, Леся Українка, Коцюбинський, Шекспір, Діккенс, etc.
- **Categories**: українська література, світова література, суспільне оцифрування
- **Scraper**: Node.js script crawled Google Sites pages, extracted Google Drive EPUB links, downloaded 311 MB
- **Upload**: batch upload via admin API with auto author/genre creation
- **Source**: OpenBook2 — електронна бібліотека класики української та світової літератури

### Rebrand: OnlineLib → TextStack
- **Solution & projects renamed** - `onlinelib.sln` → `textstack.sln`, `OnlineLib.*` → `TextStack.*`
- **C# namespaces updated** - 70+ files migrated to `TextStack.*` namespaces
- **Telemetry renamed** - service names `textstack-api/worker`, activity sources `TextStack.*`
- **GitHub repo renamed** - `github.com/mrviduus/textstack`
- **Deployment paths updated** - workflows, Makefile, nginx config

### Single Domain Consolidation (ADR-007)
- **textstack.app** - single public domain for all books
- **textstack.dev** - admin panel only (auth-gated, noindex)
- **Migration** - merge programming books to general site
- **Admin Tools page** - reprocess, reimport, sync operations
- **Removed multisite code** - HostSiteResolver, SiteService, AdminSitesEndpoints
- **Admin port** - changed from 5174 → 81 (easier to remember)
- **SSG Worker** - Docker service polls DB for rebuild jobs, prerenders pages automatically
- **See**: `docs/01-architecture/adr/007-single-domain-consolidation-deploy.md`

### Removed
- **DjVu format support** — unused, removed extractor, tests, Docker deps
- **Tempo** - distributed tracing service removed to save ~350MB RAM
- **Multisite infrastructure** — HostSiteResolver, SiteService, SitesPage (ADR-007)
  - Traces still collected via OTEL but not stored
  - To restore Tempo in future, see `docs/tempo-restore.md`

### Offline Reading (PWA)
- **IndexedDB storage** - chapters cached locally for offline reading
- **Download manager** - global context tracks active downloads, progress, errors
- **Resume support** - paused/interrupted downloads continue from last chapter
- **Storage quota check** - warns when <50MB available, handles QuotaExceededError
- **Kindle-style library UI** - 3-dots menu with download/resume/remove options
- **Offline badge** - visual indicator (download icon, spinner, pause icon)
- **Cache-first reader** - serves from IndexedDB when available

### User Authentication
- **Google OAuth** - cookie-based auth with JWT refresh
- **User library** - save/unsave books, persisted server-side
- **Reading progress sync** - resume position synced to server
- **Continue Reading** - library shows last read chapter with progress bar

### Library
- **My Library page** - grid view of saved books
- **Progress indicators** - visual progress bar per book
- **Read/unread status** - mark books as read
- **Quick actions** - context menu for common operations

### Search Improvements
- **Enter to search** - pressing Enter navigates directly to search page
- **Overlay close fix** - View All Results properly closes overlay
- **Direct navigation** - search input triggers page navigation

### Admin
- **Stats cards** - authors/genres pages show count summaries
- **Genres filter alignment** - consistent with authors page layout
- **Published filter** - sitemap/admin respects publication status

### SEO - Chapter Splitting
- **Chapter splitter** - long chapters auto-split at word boundaries (HTML block-aware)
- **Site-level config** - `MaxWordsPerPart` per site (general: 1000, programming: 2000)
- **Split-on-publish** - chapters split before publishing, reload after split
- **Reprocessing API** - `POST /admin/reprocess/split-existing` for batch reprocess
- **GeneratedRegex** - compiled regex patterns for performance

### Reader
- **Theme cleanup** - reader theme properly reset on unmount (fixes body class leak)
- **Mobile progress** - footer shows overall book % instead of chapter %
- **Help button** - hidden on mobile (keyboard shortcuts not applicable)
- **Scroll tracking** - mobile progress bar reflects scroll position
- **Double-tap fullscreen** - double-tap on content toggles fullscreen (mobile)

### SEO
- **Legacy URL redirects** - 301 redirect `/authors/*` → `/en/authors/*` (nginx + React Router)
- **Google Search Console fix** - non-prefixed URLs now properly redirect to language-prefixed versions

### i18n
- **Full Ukrainian i18n** — all pages translated (en/uk JSON files)
- **Dynamic language** in library list view links

### E2E Testing
- **Playwright e2e tests** — chromium, mobile, admin projects with CI pipeline
- **Flaky test fixes** — bookmark test waits for btn enabled before click

### Reader
- **Text selection** — highlights, translate (LibreTranslate), dictionary
- **iOS selection toolbar fix** — use `selectionchange` event, suppress native context menu in PWA

### Infrastructure
- **Regex timeouts** in text processors
- **Retry on 5xx/429 errors** — error state in home sections
- **Separate storage URL config** — reader highlights height fix

### SEO
- **Trailing slashes** on all sitemap URLs (books, authors, pages)
- **IndexNow API key** for Bing indexing
- **URL redirects & canonicalization** — redirect logic in HTTP block for Cloudflare SSL

### Ops
- **Sudoers** for passwordless nginx deploy
- **Backup directory** → `~/backups/textstack`
- **Docker context fix** — `.dockerignore` to exclude data folder, permission fixes

### Removed
- **Old IndexNow key file**
- **Redundant download button** from library list

### Documentation
- **database.md** - Updated to match actual schema: added UserRefreshToken, BookAsset, TextStackImport, SeoCrawlJob, SeoCrawlResult; fixed Chapter/User/IngestionJob/ReadingProgress/Bookmark/Note schemas; removed non-existent search_documents table

---

## [0.1.0] - 2025-01-09 - MVP 1

### Reader
- **Full-featured Kindle-like reader**
  - Centered text column, responsive layout
  - Settings drawer: font size, line height, width, theme (light/sepia/dark), font family, text alignment
  - TOC drawer, chapter prev/next navigation
  - Progress % indicator, localStorage persistence
- **Fullscreen mode** - auto-hide top/bottom bars, `F` shortcut
- **Keyboard shortcuts** - arrow keys, `?` for help modal, help button in top bar
- **Mobile support** - swipe navigation, centered nav arrows
- **Visual effects** - aged book edge / burnt paper effect

### UI/UX
- **Header** - collapsing animation on scroll, language switcher (UA/EN)
- **Search** - integrated in header, fuzzy/typo-tolerant, view all results link fix
- **Home hero** - responsive layout, improved alignment
- **Book grid** - responsive layout improvements
- **About page** - creator section with image

### Backend
- **SEO module** - `GET /seo/sitemap.xml`, `SeoService`, `SeoHead` component
- **Full-text search** - PostgreSQL FTS, pg_trgm fuzzy search, GIN indexes
- **Example books seeder** - migration seeds sample data
- **Public API** - `/books`, `/books/{slug}`, `/books/{slug}/chapters/{chapterSlug}`, `/authors`, `/genres`, `/search`
- **Admin API** - file upload, ingestion jobs CRUD
- **EPUB parser** - VersOne.Epub + HtmlAgilityPack, chapter extraction
- **Ingestion worker** - background polling, EPUB → chapters, search_vector indexing
- **Data model** - Work/Edition hierarchy, Admin auth system, UserLibrary
- **Admin app** - separate React app on port 81

### Changed
- Rebrand to **TextStack**, default language to English
- Book/Translation → Work/Edition data model
- Swashbuckle → Scalar.AspNetCore for OpenAPI
- Docker compose defaults (`.env` optional)

### Technical
- Fresh migration: `Initial_WorkEdition_Admin`
- Removed: Book, BookTranslation, ChapterTranslation entities

