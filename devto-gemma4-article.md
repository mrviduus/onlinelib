# Dev.to article — Gemma 4 Challenge submission (Build category)

**Strategy:** submit to **"Build with Gemma 4"** ($500 × 5 winners, vs Write at $100 × 5). Required structure: `## What I Built` / `## Demo` / `## Code` / `## How I Used Gemma 4`. Lead with the strongest hook this draft has — the silent-fallback discovery — then deliver against each judging criterion in order.

**Judging criteria, mapped to sections:**

| Criterion | Section that proves it |
|---|---|
| Intentional and effective use of Gemma 4 | `## How I Used Gemma 4` — full trade-off table + the second-swap narrative (e4b → e2b once prod data was in) |
| Technical implementation and code quality | `## Code` (AGPL repo + 3 PRs + 4 follow-up commits with diffs) + the 6-lesson walkthrough |
| Creativity and originality | What I built (technical-vocab SRS for non-native devs reading dense English books) + two model swaps in one project + 63k load test on consumer hardware |
| Usability and user experience | Demo of live `textstack.app` + sample chapters without signup + the 100% success rate at 500 RPS under load |

---

## Title (recommended)

```
I shipped local LLM features two months ago. Production never ran them once.
```

Hook test against the field: top current entry is *"Gemma 4: Why Local AI is Finally Becoming Personal"* — generic, no production data. Ours is specific, second-person-implicating, promises a story, and reveals it was on Gemma 4 by paragraph two. Keep.

Backup if Build judges prefer category-clean titles: *"How I rebuilt Kindle Word Wise on Gemma 4 e4b — and discovered Ollama had been silently empty for two months"*.

---

## Tags (required by challenge)

`devchallenge`, `gemmachallenge`, `gemma`

The challenge announcement and submission template both list exactly these three. dev.to caps tags at 4. **Do not add `ai`, `opensource`, or `selfhosted`** in their place — judges filter by `gemmachallenge` and the official three keep us in the eligible pool. If we want a 4th, `webdev` and `ollama` are safer than thematic ones.

---

## Cover image prompt for Dev.to AI generator

```
Flat minimalist illustration: a server rack labeled "ollama" in the foreground,
its model slot drawn as an empty glass cylinder. On the right, two stacked
model containers labeled "gemma4:e4b" (fading out) and "gemma4:e2b" (sliding
in, glowing). Faint code-trace lines underneath in soft teal and purple. Wide
banner aspect ratio (1000×420), no people, no faces, dev.to-friendly clean
style. Visual hint of "two swaps, one challenge".
```

---

## Article body (paste into Dev.to editor)

```markdown
*This is a submission for the [Gemma 4 Challenge: Build with Gemma 4](https://dev.to/challenges/google-gemma-2026-05-06)*

Two months ago I shipped local-LLM features in [TextStack](https://textstack.app) — an open-source reader for developers who want to finish dense English technical books in their native language. Yesterday I noticed something strange about the production server's RAM. 3 GB used out of 30. The model that runs all those features should be ~13 GB resident.

I SSH'd in.

```bash
$ docker compose exec ollama ollama list
NAME    ID    SIZE    MODIFIED
$
```

Nothing. The Ollama container had been running for 60+ days without a single model pulled. Every distractor call had fired, hit the fallback path, and returned random vocabulary words. I never noticed because the failure mode is silent — the user sees distractors, just not LLM-generated ones.

This is the post-mortem of that, plus the **two model swaps** that finally got the features working: `qwen3:8b → gemma4:e4b` on day one to bring local inference up at all, then `e4b → e2b` once production load showed e4b couldn't keep up on CPU. **Six production bugs surfaced along the way.** The article ends with a real 63,000-request load test on the e2b deploy: 100% success, p95 = 20.5 ms, total OpenAI cost = $0.002.

## What I Built

[**TextStack**](https://textstack.app) is an open-source ([AGPL-3.0](https://github.com/mrviduus/textstack/blob/main/LICENSE)) reader for developers who keep abandoning English technical books like *Designing Data-Intensive Applications*. Tap any term → context-aware translation that knows the book's domain ("attention" in an ML chapter gets *увага (механізм у нейромережах)*, not the everyday meaning). Words you save feed a capped weekly SRS queue.

Local **Gemma 4 e2b** generates the multiple-choice distractors, hints, native-language explanations, and book metadata enrichment — four jobs that previously needed paid OpenAI calls per user. OpenAI `gpt-5-mini` stays for translation (multilingual quality matters) and for in-reader live explanations (latency-sensitive). Everything else runs on a single-CPU 30 GB-RAM VPS, no GPU.

## Demo

🌐 **Live:** [textstack.app](https://textstack.app) — sample chapters open without signup. Tap any word in *Designing Data-Intensive Applications*, then check the vocabulary review.

🎬 **37-second walkthrough — read → save word → MCQ with Gemma-generated distractors → answer feedback:**

![TextStack vocabulary review demo: tap-translations in DDIA, save word to vocabulary, MCQ card with 4 Gemma-generated distractors, red/green answer feedback](https://raw.githubusercontent.com/mrviduus/textstack/main/docs/marketing/srs-mcq-demo.gif)

📸 **Single MCQ card — "___ the data from these external systems..." with 4 Gemma-generated distractors (battle / bringing / storm / courage):**

![Vocabulary multiple-choice card with cloze sentence from DDIA and 4 Gemma-generated distractor options](https://raw.githubusercontent.com/mrviduus/textstack/main/docs/marketing/srs-mcq-card.png)

> **Note for judges:** Sample chapters are unauthenticated; the vocabulary review needs a free account because progress and SRS state are per-user. Use any throwaway email — there's no email verification gate on read.

## Code

📦 **Repository:** [github.com/mrviduus/textstack](https://github.com/mrviduus/textstack) — AGPL-3.0, 200+ merged PRs, deployed at [textstack.app](https://textstack.app)

[![Star on GitHub](https://img.shields.io/github/stars/mrviduus/textstack?style=social&label=Star)](https://github.com/mrviduus/textstack) — every star tells me one more developer wants to finish DDIA without giving up

📐 **Stack:**
- Backend: ASP.NET Core 10 (clean architecture: Domain / Application / Infrastructure / Api / Worker)
- Database: PostgreSQL 16 with FTS for in-book search
- Frontend: React 19 + Vite, React Native 0.83 (Expo) for mobile
- LLM: Ollama running `gemma4:e2b` for local jobs, OpenAI `gpt-5-mini` for translation
- Deployment: docker-compose, Cloudflare Tunnel, single VPS

🔧 **Key commits behind the story:**

- [PR #232](https://github.com/mrviduus/textstack/pull/232) — original swap `qwen3:8b` → `gemma4:e4b`, image pin, memory bump
- [`3999944`](https://github.com/mrviduus/textstack/commit/3999944) — worker `Connection refused` fix + the real timeout bump (30s → 90s after measurement)
- [`966b398`](https://github.com/mrviduus/textstack/commit/966b398) — the second model swap, `e4b` → `e2b`
- [`c6db540`](https://github.com/mrviduus/textstack/commit/c6db540) — 63,000-request load test + full LoadSurge report

Full PR/commit history for the swap arc lives in [`CHANGELOG.md` under `[Unreleased]`](https://github.com/mrviduus/textstack/blob/main/CHANGELOG.md). The Gemma-using code lives in:

- [`backend/src/Vocabulary/TextStack.Vocabulary/DistractorGenerator.cs`](https://github.com/mrviduus/textstack/blob/main/backend/src/Vocabulary/TextStack.Vocabulary/DistractorGenerator.cs) — prompt template, parser, fallback cascade
- [`backend/src/Worker/Services/BookMetadataGenerator.cs`](https://github.com/mrviduus/textstack/blob/main/backend/src/Worker/Services/BookMetadataGenerator.cs) — fire-and-forget metadata enrichment

## How I Used Gemma 4

**The model selection went through two rounds.** Gemma 4 ships in four sizes. The first time I built a trade-off table, I picked the wrong one — for understandable reasons. The second time I had production data and picked correctly. Both decisions live in the same article.

Here's the matrix at the time of the first pick (E4B, day-one swap):

| Model | Disk | RAM resident | Fits on my VPS? | First-pick reasoning |
|---|---|---|---|---|
| **E2B** (2B effective) | 7.2 GB | ~5 GiB | ✅ trivially | "Too small for nuanced technical-vocab distractors" — *I'd find out this was wrong* |
| **E4B** (4B effective) | 9.6 GB | 13 GiB | ✅ with cgroup bump 4G → 12G | "Sweet spot — strong enough on quality, fits the VPS" — *picked first* |
| **31B Dense** | ~18 GB | ~24 GiB | ⚠️ tight, no headroom for Postgres + .NET | "Overkill, no room for the rest of the stack" |
| **26B MoE** | ~15 GB | ~20 GiB | ⚠️ same constraint | "MoE doesn't help short prompts here" |

The 31B and 26B MoE models would need either a GPU box or a much bigger VPS, neither of which fits an open-source project that has to remain deployable on a $20/month consumer host. So the real choice was between E2B and E4B. I went with E4B. I was wrong.

**What Gemma 4 unlocked vs the cloud alternative.** Pre-swap, every distractor generation was a ~5¢ OpenAI call per word saved per user. With ~50 saved words per active reader per book, that's $2.50/book/user — fine for me running the only instance, fatal the moment someone else self-hosts it. Local Gemma 4 makes the marginal cost per distractor ~0 (just CPU on a box already running). Same for hints, explanations, and book metadata enrichment.

**Local inference changed the economics of the feature completely.** That's the real reason the swap mattered — not the model quality, the cost shape.

## What surfaced when I actually flipped it on

The bug story isn't decoration — it's how I learned what each Gemma 4 quirk does in production. **Six lessons.** The first four came from getting e4b to run at all. The last two came from staring at the production stats after it was "running".

### Lesson 1: floating image tags lie

Original `docker-compose.yml` had:

```yaml
ollama:
  image: ollama/ollama   # no version
```

Docker pulled `latest` two months ago and cached it. `latest` at that moment was 0.22.x. Gemma 4 wasn't released yet, so the binary doesn't recognize the model family. From the host's perspective, the "local Ollama" IS the latest version — `docker image ls` shows the cached SHA, not whether upstream has moved.

```diff
- image: ollama/ollama
+ image: ollama/ollama:0.23.1
```

Pull succeeded after pinning. 9.6 GB on disk for e4b.

### Lesson 2: cgroup limits were a guess from the qwen3 era

The container memory cap (4 GB) had been sized for `qwen3:8b` and never re-evaluated. Gemma 4 e4b weights need 9.8 GiB. Inference returned `model requires more system memory (9.8 GiB) than is available` until I bumped the limit:

```diff
  deploy:
    resources:
      limits:
-       memory: 4G
+       memory: 12G
```

The lesson: every model swap should also re-evaluate the container resource block. Picked-once-and-forgotten limits are a category of silent drift.

### Lesson 3: cold load and warm latency both blew past my API timeout

First inference call hung ~60s before the first token. Default Ollama `keep_alive` is 5 minutes — after that the model unloads and the next cold call burns 60s again. Fix: `OLLAMA_KEEP_ALIVE=-1`, plus bump the API timeout from 10s → 30s.

I shipped it. Then watched production: **2 distractor generations out of 13 saved words succeeded.** The model was resident the entire time. Every miss was a wall-clock timeout. E4B on CPU just takes more than 30 seconds for many prompts.

So 30s wasn't enough either:

```diff
- "TimeoutSeconds": 30
+ "TimeoutSeconds": 90
```

Success rate climbed to ~100%. **For CPU-only Gemma 4 on a 6-core consumer VPS, your timeout has to absorb 60–90 s tail latency, not 10 s.** That gap between toy-benchmark numbers and production reality is where most local-LLM ship-and-forget bugs live.

### Lesson 4: the parser silently dropped half my output

`DistractorGenerator`'s prompt asks for 5 wrong-answer words. Smoke test for `linearizability`:

```
consistency, atomicity, serialization, concurrency, visibility
```

Five single-word distractors. Clean. Then I tried `eventual consistency`:

```
strong consistency, read-after-write, data loss, causality, serialization
```

Now look at the parser:

```csharp
.Where(w => w.Length > 1
    && w.Length < 50
    && w.Any(char.IsLetter)
    && !w.Equals(originalWord, StringComparison.OrdinalIgnoreCase)
    && !w.Contains(' '))      // ← drops "strong consistency", "data loss"
```

The filter rejects multi-word entries. Three of the five gone. With the `distractors.Count >= 3` requirement, the call returned `null` and the fire-and-forget path fell back to the hardcoded random-word picker.

The filter was there since the original implementation. **qwen3 outputs single tokens by default, so the constraint was hidden. Gemma 4 prefers phrasal answers** — it's the most cross-model-family-sensitive parsing surface you'll hit when swapping. The fix was a single line in the prompt:

```
- SINGLE WORD ONLY — no spaces, no multi-word phrases
  (use "linearizability" not "strong consistency"). Hyphens are fine.
```

After all four fixes, a real production save of `warehouse` returned:

```json
["storeroom", "depot", "facility", "silo", "loft"]
```

Five domain-adjacent single-word distractors, exactly the shape the prompt asks for. That's the moment local Gemma 4 was finally doing real work.

### Lesson 5: the worker had been silently failing for two months

While collecting production stats for *this article*, I grepped the worker logs:

```bash
$ docker compose logs worker | grep "Connection refused"
... lots of lines ...
```

`docker-compose.yml` had set `Ollama__BaseUrl` on the `api` service but **not on the `worker` service**. The worker fell back to the default (`localhost:11434` inside the worker container — there is nothing there) and every `BookMetadataGenerator` call hit `Connection refused` silently. Every user-uploaded book ended up with `genre = NULL`, which in turn meant the domain-aware translation prompt had nothing to bias against.

This was a *second* silent fallback, completely orthogonal to the original one. Same shape, different surface. Fix:

```diff
  worker:
    environment:
+     Ollama__BaseUrl: http://ollama:11434
+     Ollama__Model: gemma4:e2b
```

Plus a one-shot `MetadataBackfillWorker` (a small `BackgroundService` that runs on worker startup) to heal the ~10 user-uploaded books with `genre = NULL`, idempotently.

**The pattern is the lesson.** Anywhere you distribute environment via a compose file, ask: which services *actually need this variable* and is the variable set on each of them? "Inherits from .env" is not a thing in docker-compose service blocks.

### Lesson 6: turn off thinking mode for structured outputs

Modern Ollama models (including Gemma 4) default to a chain-of-thought "thinking" pass before the final answer. For freeform reasoning that's a quality win. For my use case — output a 5-element list of single words — the thinking pass is pure overhead. Every request was generating 50–200 tokens of internal reasoning the parser then threw away.

In the Ollama call options:

```diff
- options: { "temperature": 0.7 }
+ options: { "temperature": 0.7, "think": false }
```

Roughly halved the per-request token output. Roughly halved end-to-end latency. The quality of the distractors did not drop in my testing — for "give me 5 plausible wrong-answer words for `warehouse`", chain-of-thought wasn't doing anything load-bearing.

If you're using Ollama for structured outputs, this is the single biggest perf knob most people don't know about.

## The second swap: e4b → e2b

After all six lessons above, distractor calls were succeeding at ~100%. But end-to-end save latency was still tail-heavy. Looking at the numbers honestly: most calls landed in the 30–60 s range, and the 90 s timeout was absorbing what should have been a comfortable fit.

Two things were happening at once:

1. **E4B's 13 GiB resident was contesting RAM with Postgres + .NET** on a 30 GB box. Not OOM-level, but the working set wasn't always in cache.
2. **Even with `think=false`, e4b is genuinely slow on a 6-core CPU.** I'd been benchmarking on a warm cache and short prompts; longer prompts (explanations, multi-sentence hints) routinely hit 60 s+.

I swapped to **e2b**:

| Metric | e4b (after all fixes) | e2b (current prod) |
|---|---|---|
| Disk | 9.6 GB | **7.2 GB** |
| RAM resident with `KEEP_ALIVE=-1` | 13 GiB | **7.7 GB** |
| Inference speed on same CPU | baseline | **~2–3× faster** |
| Quality on single-word distractor task | reference | **comparable** for short structured outputs |

The first-pick reasoning ("E2B's quality is too weak for technical vocabulary") had been based on a *quality* benchmark. The real production constraint turned out to be *latency*. **For short structured outputs — distractor lists, single-line hints — e2b is fast enough that quality differences disappear into the prompt template**. The prompt was doing more work than I'd given it credit for.

For longer freeform outputs (the 2–3 sentence native-language explanation), e2b is measurably less polished. Acceptable for the use case (it's a study aid, not a translation). If a future task demands better explanation quality, the path is a fine-tune of e2b on TextStack's domain corpus, not jumping back to e4b. Same hardware envelope, better domain fit.

## Numbers (real, post-e2b)

The numbers below are measured on the production server: AMD Ryzen 5 4600H, 6 cores / 12 threads, 30 GiB RAM, no GPU. Same box that serves traffic to [textstack.app](https://textstack.app).

| Metric | Value |
|---|---|
| **Disk (`gemma4:e2b`)** | 7.2 GB |
| **RAM resident** with `KEEP_ALIVE=-1` | 7.7 GB |
| **Cold load** (container restart) | ~10 s |
| **Distractor cost per word** | ~0¢ (CPU on existing box) |
| **Equivalent OpenAI cost** | ~5¢ per word at gpt-5-mini rates |

### Load test: 63,000 requests, 100% success, $0.002

After the e2b swap I stress-tested the production deploy with [LoadSurge](https://github.com/mrviduus/textstack/tree/main/tests/TextStack.LoadTests). Three scenarios — `GET /health`, `POST /translate`, `POST /explain` — at 30–50 virtual users for 30–60 seconds each. Headlines:

| | |
|---|---|
| Total requests | **63,000** |
| Success rate | **100%** (0 failures) |
| Worst-case p95 latency | **20.5 ms** (smoke; translate and explain were lower) |
| Sustained RPS at 50 VU | **500** |
| OpenAI cost during the run | **$0.002** (10 cache-prewarm calls; zero during the stress phase) |
| Peak temperature on the host | **42 °C** (throttle threshold 95 °C) |

The interesting part isn't the throughput — 500 RPS on a $20 box is real but not surprising for cached HTTP. The interesting part is that the expensive path disappeared entirely behind the cache. Translate and Explain are keyed by `(input, target_language, genre, sentence)`; on a hot cache the LLM never enters the request lifecycle.

The auth-gated `POST /me/vocabulary/words` path that triggers actual Gemma 4 distractor generation wasn't covered by this run — that's the next test, with test-auth tokens and a bounded-concurrency queue in front of Ollama. The full per-scenario breakdown is in [`docs/loadtest/run-20260511-103451/REPORT.md`](https://github.com/mrviduus/textstack/blob/main/docs/loadtest/run-20260511-103451/REPORT.md).

## Where OpenAI stays

The split after both swaps:

| Task | Provider | Why |
|---|---|---|
| Vocabulary distractors | **Local Gemma 4 e2b** | Tolerable quality, fire-and-forget, no per-user cost |
| Word hints | **Local Gemma 4 e2b** | Same |
| Native-language explanations | **Local Gemma 4 e2b** | Same; acceptable on long-form quality given the use case |
| Book metadata enrichment | **Local Gemma 4 e2b** | Same |
| Translation (18+ langs, incl. Ukrainian) | OpenAI gpt-5-mini | Small-model multilingual translation is still a weak spot |
| In-reader term explanation (live) | OpenAI gpt-5-mini | <1 s latency requirement during reading |

Local LLMs aren't a wholesale cloud replacement. **They're a tool for tasks where quality is tolerant, latency is amortizable, privacy matters, or per-user cost matters.** When any of those breaks down — multilingual translation, latency-sensitive UI — cloud still wins.

## Lessons (for anyone shipping local LLMs)

**Silent fallback is the worst kind of bug.** Distractor generation had been failing in production for 60+ days and I had no signal — the fallback was a hardcoded random-word picker, indistinguishable to the user. **And it happened twice in the same system, on two different surfaces** (Ollama-not-installed, then Worker-can't-reach-Ollama). Next time: emit `llm.success` and `llm.fallback` counters per service, alert if the ratio drifts above 5%, and never make fallbacks bit-for-bit indistinguishable from the primary path.

**Floating image tags lie.** Pin Ollama, pin Postgres, pin everything. `latest` freezes the day Docker pulls it; two months later it's lagging upstream and you have no signal until a new model breaks it.

**Defend at parse, always — even if your model behaved on first try.** Same prompt — qwen3 returns single tokens, Gemma 4 returns phrases. The parser's pre-existing `!w.Contains(' ')` filter was correct in spirit but hidden from the model. Moved into the prompt, it became explicit and Gemma satisfied it.

**Bench with real prompts on real hardware.** I tested e4b's quality on warm-cache short prompts and concluded it was the right pick. Real production tail latency on longer prompts was 3× what the smoke test suggested, and that's what forced the e2b downgrade. Toy benchmarks hide both model-family quirks (parsing) and hardware-bound failure modes (CPU latency).

**Turn off thinking mode for structured outputs.** `think: false` is the single biggest perf knob on Ollama for short structured tasks. Most documentation doesn't surface it.

**Distribute env vars deliberately across services.** Docker-compose service blocks don't inherit from each other. Whichever service actually needs a variable — list it explicitly in *that service's* env block. The day you add a new service, audit every variable.

---

> The interesting part wasn't that the model failed. It was how long the system kept pretending it hadn't.

## What's next

**Fine-tune Gemma 4 e2b on TextStack's distractor task.** I now have a real production corpus building (a few hundred (term, distractor-list) pairs per week post-fix). The corpus that existed before the fix is gone — every distractor it produced came from the hardcoded fallback, not the model. The dataset starts fresh.

**Add a bounded-concurrency queue in front of Ollama for the write path.** From the load test recommendations: a `Channels`-based worker with `MaxConcurrency = 2` plus a per-`(word, language)` shared cache. Mirrors the translate/explain caches that just held 500 RPS with zero LLM cost.

**Run a second load test against the auth-gated write path.** The 63k-request test only measured cached reads. Distractor generation is the actual bottleneck, and it sits behind authentication. Need test-auth tokens and 10–20 VU to bound it.

The full TextStack codebase is AGPL-3.0 at [github.com/mrviduus/textstack](https://github.com/mrviduus/textstack). If you've shipped local-LLM features in production, **run `ollama list` on your server, then `docker compose logs worker | grep -i refused`**. One of those might surprise you. Mine surprised me twice in the same codebase — same shape, different surface, two months apart. That's the part of operating local LLMs that nobody writes about, and the part that takes the longest to learn.

---

*If you found this useful, the strongest signal is a star on the [repo](https://github.com/mrviduus/textstack). Every star tells me the next person abandoning DDIA mid-way might find this tool — and that's the whole point.*
```

---

## Posting checklist

- [ ] Open https://dev.to/new — or use the prefilled Build template URL: https://dev.to/new?prefill=---%0Atitle%3A%20%0Apublished%3A%20%0Atags%3A%20devchallenge%2C%20gemmachallenge%2C%20gemma%0A---
- [ ] Title: **I shipped local LLM features two months ago. Production never ran them once.**
- [ ] Tags: `devchallenge`, `gemmachallenge`, `gemma` (and optionally `ollama` as the 4th)
- [ ] Verify the first line is exactly `*This is a submission for the [Gemma 4 Challenge: Build with Gemma 4](https://dev.to/challenges/google-gemma-2026-05-06)*` — without it the post is not a valid submission
- [ ] Cover image: generate via Dev.to "Generate Image" with the prompt above
- [ ] Paste the body markdown — both media URLs are already inlined and point at `raw.githubusercontent.com/mrviduus/textstack/main/docs/marketing/srs-mcq-card.png` and `.../srs-mcq-demo.gif`. No drag-and-drop needed in the editor.
- [ ] Confirm media commits are pushed to `main` (`git log docs/marketing/srs-mcq-*.{png,gif}`); without push the raw URLs will 404 when Dev.to fetches them
- [ ] Verify all GitHub PR links resolve (#232, #233, #234) and the four follow-up commit links resolve (`3999944`, `a5a76d8`, `966b398`, `c6db540`)
- [ ] Verify the `DistractorGenerator.cs` and `BookMetadataGenerator.cs` paths in the Code section resolve to actual file URLs
- [ ] Advanced Options → Canonical URL: leave empty (Dev.to is the original)
- [ ] Preview — check tables, code blocks, the inline diff blocks render
- [ ] Schedule for 2026-05-12 12:30 UTC (= Tuesday 8:30 ET, peak Dev.to traffic window)

## Post-publish (within 60 min on Tuesday morning)

- [ ] Tweet from `@Rexetdeus` linking the Dev.to URL — quote the strongest line ("Production never ran them once") not the whole title
- [ ] Post in `/r/selfhosted`, `/r/LocalLLaMA`, and `/r/dotnet` with the article link and a 2-sentence Reddit-native intro (do not crosspost the same blurb to all three — each subreddit has its own tone; ready-to-paste texts in `social-media-pack.md`)
- [ ] Post in HackerNews — it'll either land or not, but the bar to try is low
- [ ] Reply to the first 3-5 comments on dev.to within 2 hours — judges weight engagement, and reactions are the official tie-breaker
- [ ] DM Jess Lee (organizer) to thank her for running the challenge — she's actively reading comments on her launch post and a polite tag visibility helps

## Why this version is structured to win

- **Submission header line is in.** The previous draft missed this; without it dev.to wouldn't count the post in the eligible pool.
- **Tags fixed** to the official three from the announcement.
- **Build template structure** (`What I Built` / `Demo` / `Code` / `How I Used Gemma 4`) is satisfied as section headers, not just implicitly.
- **"Intentional model selection"** — the first Build judging criterion — is shown twice over: first the E2B/E4B/31B/26B MoE trade-off table, then the *actual production downgrade* from e4b to e2b after measurement. That's a stronger demonstration than any other current Build entry's single-pick reasoning.
- **Demo media is real, in the repo, and inlined via raw.githubusercontent URLs** — no upload friction, no broken placeholders.
- **Six bug-chain lessons + a 63k-request load test** establish "technical implementation and code quality" against the second Build criterion.
- **All numbers are measured on the production server**, not estimated. The 100% success at 500 RPS, the p95 = 20.5 ms, the $0.002 cost — these are reproducible from the linked LoadSurge harness.
- **Hook is preserved** ("Production never ran them once") — strongest line in the field of current submissions.

## Field analysis (snapshot Monday May 11, ~11:00 AM ET)

`#gemmachallenge` field grew from 12 entries on May 8 to 85 on May 11. The top of the field by reactions:

| Reactions | Title | Category | Notes |
|---|---|---|---|
| 85 | Gemma 4: Why Local AI is Finally Becoming Personal | Write | Generic essay; boost window closed (+11 over 4 days) |
| 12 | Your SOS App Can't Help... Local AI Safety Layer | Write | Concept-only, no built thing |
| 11 | The Local Model That Doesn't Sleep: MTP Marathon Engine | Write | Server-GPU technical deep-dive — different audience |
| 10 | Gemma 4 Has Four Models. Here's Which One You Need | Write | Comparison piece |
| 9 | The End of Renting Intelligence? | Write | Op-ed |
| 8 | I Tested Every Gemma 4 Model on a GTX 1650 | Write | Consumer-GPU benchmark; new on May 11 |
| ≤7 | All Build entries combined | Build | **Top Build entry has 7 reactions** |

**Tahosin's 57-reaction "$500 GPU → $75 Raspberry Pi" piece has vanished from top/week.** Possibly DQ'd over missing `#gemma` tag; possibly withdrawn. One serious adjacent threat removed itself from the field.

**No current Build entry has a deployed product with real production data, multiple model swaps, AND a 63k-request load test.** That's our wedge.

## What changed from the previous draft

Cuts:
- "AI / opensource / selfhosted" tags (replaced with official three)
- The whole "stuck on e4b" narrative — replaced with two-swap arc
- Estimated/wishful "warm 2.8s" inference number — replaced with measured prod data
- 10s → 30s timeout fix — corrected to the real story (30s → 90s after measurement)
- `gpt-4.1-nano` references everywhere — corrected to current prod model `gpt-5-mini`

Adds (vs. yesterday's docx):
- **E4B → E2B downgrade story** with reasoning grounded in measured prod data — directly serves the "intentional and effective use of the chosen Gemma 4 model" judging criterion
- **Lesson 5 — Worker `Connection refused`** silent fallback (second silent-fallback surface in the same system)
- **Lesson 6 — `think=false` Ollama optimization** that roughly halved latency
- **Real warehouse example** — `warehouse → ["storeroom", "depot", "facility", "silo", "loft"]` as the "moment local Gemma 4 was finally doing real work"
- **Real production stats** — 13 saves, 2/13 success rate before the 90s timeout fix, ~100% after
- **63,000-request load test section** with full per-scenario table and the $0.002 OpenAI cost
- **What's next** expanded with bounded-concurrency-queue plan from the load test recommendations
- **6 lessons** in the closing section instead of 4

Word count: ~2,650 (was ~1,700). Length is justified by the production data and second swap; this is now a genuine "I shipped this twice and measured both" Build entry, not a single-decision narrative.
