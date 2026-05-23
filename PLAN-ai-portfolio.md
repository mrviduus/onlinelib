# TextStack — AI Portfolio Roadmap

**Fixed**: 2026-05-15 · **Target**: pre-Oct 2026 launch · **Mode**: AI-engineering portfolio + product differentiator

## Why this plan

Project goal is twofold: (a) ship paying-customer product by Oct 2026, (b) build a serious AI-engineering portfolio. Existing AI surfaces (Explain, Translate, Distractor/Hint/Explanation gen via Ollama, SEO generation via Claude CLI, prompt injection sanitizer, immutable replay for SEO jobs) are already production-grade and underused as portfolio material. This plan sequences the next moves without sacrificing the Oct 2026 deadline.

**Hard rule**: nothing here ships before mobile feature-parity on Google Play. Without users, AI features are demos.

---

## Sequence

| # | Step | Duration | Why now |
|---|------|----------|---------|
| 1 | **Mobile feature-parity + Google Play launch** | 3–4 weeks | Without mobile, no paying customers, no real users for AI features |
| 2 | **Observability + eval on existing AI** | 1 week | Free portfolio uplift; required before adding new AI |
| 3 | **Podcast generation (MVP)** | 1 week | Killer differentiator, viral-friendly, simple stack, uses existing Edge TTS |
| 4 | **RAG "Ask this book"** | 2–3 weeks | Deep AI feature with pgvector + hybrid retrieval |
| 5 | **Podcast voice upgrade (optional)** | 1 day | Swap Edge TTS → ElevenLabs or OpenAI `tts-1-hd` for quality |

---

## Step 1 · Mobile Google Play launch *(unchanged — already in flight)*

Out of scope for this doc. See existing mobile track in `PLAN-presale-8w.md`.

---

## Step 2 · Observability + eval on existing AI

Goal: turn the "I shipped 5 AI features" into "I shipped 5 AI features with eval + observability". This is what separates mid+ from junior on interviews.

**What to build:**

- Log every LLM call (Explain, Translate, Distractor, Hint, Explanation, BookMetadata, SEO) with: input, output, model, latency, token cost, IP/user, cache hit/miss.
- Admin page `AI Quality`:
  - Recent calls table, filter by surface (explain / translate / …)
  - Manual rating buttons: good / bad / needs-fix
  - Cost dashboard (per surface, per day)
- Eval dataset (~100 examples per surface):
  - Inputs + expected concepts the output should include
  - Run on every prompt change (CLI: `dotnet run --project tools/AiEval`)
  - Outputs: pass rate, regression diff vs previous run
- LLM-as-judge for soft criteria (faithfulness, helpfulness) — use Claude as judge over gpt-5-mini outputs

**Acceptance**: prompt change blocked from merging unless eval suite passes. Talking point on interview: "every AI surface has a regression-tested prompt".

---

## Step 3 · Podcast generation (MVP)

Goal: "Listen to DDIA Chapter 5 as a 20-min podcast". Killer differentiator, no one else does this for the technical-books niche. Plays into "Finish English technical books" positioning.

### Architecture

```
backend/src/Domain/Entities/
  PodcastGenerationJob.cs       // queued / processing / ready / failed
  Podcast.cs                    // EditionId, Mp3Path, Duration, ScriptJson, CreatedAt

backend/src/Worker/Services/
  PodcastWorkerService.cs       // polls queue, runs pipeline

backend/src/Application/Podcast/
  ScriptGenerator.cs            // LLM → JSON dialogue
  PodcastSynthesizer.cs         // multi-voice TTS + FFmpeg stitch

backend/src/Api/Endpoints/
  PodcastEndpoints.cs           // GET /api/books/{slug}/podcast(.mp3|/script)
```

### Pipeline

1. **Chunk content** — collect `Chapter.PlainText` per edition. For large books: summarize each chapter to 500–800 words via gpt-5-mini → "book brief" ~5–10K words.
2. **Generate script** — prompt gpt-5-mini / Claude to produce a 20-min dialogue:
   - Host (curious, asks questions) + Expert (knowledgeable, explains)
   - Output strict JSON: `[{speaker: "host"|"expert", text: string, pause_after_ms: number}]`
   - Aim for ~3000–5000 words of dialogue
3. **Synthesize each line** — call existing `EdgeTtsService` per line:
   - Host = `en-US-AriaNeural`, Expert = `en-US-GuyNeural`
   - Parallelize per line, cache per SHA256(line + voice)
4. **Stitch with FFmpeg** — concat reps with 300–500ms pauses, normalize with `loudnorm`, output mp3 ~30–50MB.
5. **Store & serve** —
   - `data/storage/books/{editionId}/podcast.mp3`
   - `data/storage/books/{editionId}/podcast-script.json`
   - Endpoint streams mp3 with `Range` header support
6. **Reader integration** — `🎧 Listen` button on book detail and reader; player + transcript with click-to-jump.
7. **Mobile** — RN audio player with lock-screen controls (`expo-av` or `react-native-track-player`).

### Cost per podcast (30 min)

- LLM script gen: ~$0.05 (gpt-5-mini)
- TTS: $0 (Edge TTS)
- Storage: 30–50MB
- For full 1500-book corpus pre-generation: ~$75 + ~75GB disk

### Acceptance

- Generate podcast for one technical book (e.g. DDIA) end-to-end
- Plays smoothly on web + mobile
- Lock-screen controls work on Android
- Admin can re-trigger generation

### Marketing payoff

Short demo video for Twitter/Dev.to: "Listen to DDIA Chapter 5 as a podcast — generated on the fly, free, with TextStack". This is the post that gets reshared.

---

## Step 4 · RAG "Ask this book"

Goal: user reading DDIA can tap `Ask` in reader → chat that answers from (a) chapters they've read so far, (b) their own highlights/notes across all books. With citations and jump-to-chapter.

### Constraints / rules

- **Hand-rolled in C# with Npgsql.** No LangChain / LlamaIndex / agents. Two SQL queries + one prompt. Showing you understand RAG is more impressive than importing it.
- **Spoiler-safe**: only retrieve from chapters with `reading_progress >= chapter_end`.
- **Private corpus per user**: user highlights + notes are part of retrieval (unique angle nobody else has).

### Stack

- **pgvector** on existing Postgres (one migration, no new infra)
- **Embeddings**: `nomic-embed-text` via existing Ollama (free, local, portfolio bonus). Fallback to `text-embedding-3-small` if Ollama unavailable.
- **Chunking**: paragraph-level with 50–100 word window, 1 sentence overlap. Store `embedding`, `chapter_id`, `paragraph_index`, `text`.
- **Hybrid search**: existing Postgres FTS + cosine similarity, combined via **Reciprocal Rank Fusion** (`RRF score = sum(1 / (k + rank_i))`, k=60). Blog-post-worthy talking point.
- **LLM answer**: gpt-5-mini, streamed via SSE.

### Schema additions

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE chapter_embeddings (
    id           BIGSERIAL PRIMARY KEY,
    chapter_id   UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    paragraph_ix INT NOT NULL,
    text         TEXT NOT NULL,
    embedding    VECTOR(768) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON chapter_embeddings USING hnsw (embedding vector_cosine_ops);

CREATE TABLE highlight_embeddings (
    id            BIGSERIAL PRIMARY KEY,
    highlight_id  UUID NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL,
    embedding     VECTOR(768) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Retrieval flow

```
1. Embed user question via Ollama nomic-embed-text
2. Two retrievals (parallel):
   a) chapter_embeddings WHERE chapter_id IN (already_read_chapters_for_user_in_book)
      ORDER BY embedding <=> query LIMIT 20
   b) Postgres FTS on chapter.plain_text scoped to same chapters
3. RRF combine → top 5 chunks
4. Same retrieval against highlight_embeddings WHERE user_id = current_user
   → top 3 personal highlights
5. Prompt gpt-5-mini with: question + 5 chunks + 3 highlights + instruction
   "answer only from provided context, cite chapter+paragraph"
6. Stream response via SSE; client renders citations as jump-to-chapter links
```

### Eval setup

- 30 hand-crafted Q&A pairs against DDIA
- Metrics: `recall@5` (did right chunk show up?), `faithfulness` (LLM-as-judge: does answer rely on retrieved context?), `latency p95`
- Run on every prompt or retrieval change

### Acceptance

- Ask answers grounded questions from DDIA with chapter citations
- Spoilers blocked (verified by test)
- Personal highlights surface when relevant
- Eval suite green
- Streaming UI on web + mobile

---

## Step 5 · Podcast voice upgrade (optional, post-launch)

Swap `ITtsService` Edge implementation → ElevenLabs or OpenAI `tts-1-hd` behind a flag for podcast generation only (regular TTS stays on Edge — it's free and fine for in-reader use).

- ElevenLabs: ~$1.50 per 30-min podcast, NotebookLM-level quality
- OpenAI `tts-1-hd`: ~$0.15 per 30-min podcast, decent quality

Trigger only when worth it — e.g. for featured books, or as a paid tier.

---

## What's explicitly NOT in this plan

- **LangChain / LlamaIndex / agent frameworks** — hand-rolled is more impressive in 2026.
- **General "chat with any book"** — breaks "deep reading" positioning, weakens the spoiler-safe story.
- **Multi-modal (images, video)** — out of scope.
- **Voice cloning of the user / custom narrators** — fun, but adds zero portfolio weight.
- **Fine-tuning custom models** — wrong layer for this project.

---

## Portfolio talking points (collected for resume / interviews)

After this plan is done:

1. **Production AI system in C#/.NET** with 7+ LLM surfaces, multi-model architecture (OpenAI + Ollama + Claude CLI), prompt injection defense, audit trail with immutable replay.
2. **Observability + eval pipeline** — every prompt change gated by regression tests with LLM-as-judge.
3. **Hand-rolled RAG** with pgvector, hybrid retrieval via RRF, private per-user corpus, spoiler-safe scoping.
4. **Audio AI pipeline** — content summarization → dialogue generation → multi-voice synthesis → FFmpeg post-processing, all from existing infra.
5. **Real users on real product** — Google Play app, paying customer target.

This is the resume of someone who builds AI in production, not someone who imports it.

---

## Open questions to answer before Step 3 starts

- Pre-generate podcasts for the 15–20 curated AI-engineering corpus, or on-demand per book?
- Per-chapter podcasts (short, scoped) vs whole-book podcasts (long, big-picture)? — probably both, start with whole-book.
- Free for all users, or gated to logged-in / paid?
- Transcript-as-SEO: serve `podcast-script.json` rendered as HTML for SEO crawlers? (likely yes — free SEO win)
