# Comment response templates

Pre-baked answers to questions you'll see within the first few hours on Dev.to, Reddit, and HN. Adjust each to the platform's voice (HN drier than Reddit, Reddit drier than Dev.to). Don't paste verbatim — make it sound like you in the moment.

**Rule of thumb:** any reply under 2 sentences should be either dropped or expanded. "Thanks!" hurts your engagement signal more than no reply at all.

---

## "Why not just use OpenAI/Claude/Gemini for this too?"

```
For four jobs (distractors, hints, native-language explanations, book metadata enrichment), the per-call cost was killing the self-host story. ~50 words saved per active reader per book × 5¢ per OpenAI distractor call = $2.50/book/user. Fine if I run the only instance, but the project's AGPL and the whole point is that anyone with a $20 VPS can run it. The moment someone else's hosting bill becomes their problem, cloud LLM costs make TextStack unrunnable for them.

Translation stayed on OpenAI because multilingual quality, especially Ukrainian, isn't there yet on local 4B-parameter models. Different tasks, different trade-offs.
```

---

## "Why E4B and not 31B / 26B MoE?"

```
Short answer: 31B and 26B MoE need either a GPU or a much bigger box. E4B fits the constraint that matters — TextStack has to be deployable by anyone with a $20/month consumer VPS. Article goes into the trade-off matrix in the "How I Used Gemma 4" section, but the TLDR is: E2B was too weak for technical-domain distractor quality, E4B is the smallest model that produces plausible siblings for terms like "linearizability", and the bigger models would force a hardware upgrade I'm not asking my users to make.
```

---

## "Why not run on GPU?"

```
RTX 5090 + vLLM + 31B + MTP is a different conversation — the speed and reasoning quality are on another level. There's a great post about that exact stack from @ertugrul_demir on Dev.to right now. I deliberately picked the opposite direction: keep it consumer-VPS-only so the self-host story is real, not aspirational. Different audience, different trade-off space.
```

---

## "Can I run this on a Raspberry Pi?"

```
Ollama needs ~13 GiB resident for E4B with KEEP_ALIVE=-1. A Pi 5 maxes at 8 GB RAM. So no, not on a Pi 5 with E4B. If you swap to E2B (2B effective), you can — but in my testing E2B distractor quality on technical vocabulary wasn't there. If you want vision or simpler classification on a Pi, the Tahosin post from this challenge (s/he ran Gemma 4 vision on a Pi 5 for object detection) is a better reference.
```

---

## "Why .NET? Why not Python?"

```
I've shipped .NET production for a decade and React on the side. Python would mean introducing a third language to the stack just for the LLM glue, when ASP.NET Core 10 talks to Ollama's HTTP API perfectly fine. The fire-and-forget pattern via IServiceScopeFactory is also nicer in C# than Python equivalents I've used. Mostly though: I know .NET, and the integration is one HTTP call.
```

---

## "Is AGPL really enforceable for SaaS?"

```
Honest answer: it's enforceable in principle, hard in practice unless you have legal resources. I picked AGPL not because I'm planning to sue anyone, but because it sets the expectation: if you build a SaaS off this, your modifications are public. That filters out the "fork it, slap a paywall on it, stay quiet" path which I don't want. Anyone running TextStack as-is for personal use has zero obligations.
```

---

## "What does Kindle Word Wise actually do?"

```
It's a Kindle feature (frozen at 2014-era rules) that shows brief explanations for "harder" words above the line as you read. Built for native English speakers who hit unfamiliar everyday words. Doesn't translate, doesn't know the book's domain, doesn't have an SRS layer, no LLM. TextStack is essentially: what would Word Wise look like if it were built today, knew the difference between "attention" the everyday word and "attention" the ML term, and could surface terms into a spaced-repetition queue.
```

---

## "Why didn't you alert on the silent fallback?"

```
Fair hit. I had no observability on llm.success vs llm.fallback split — both code paths returned a list of strings to the caller, both succeeded from the API's perspective. My todo from this incident is: emit two distinct counters, alert if the fallback ratio drifts above 5%. Pre-Gemma-swap I'd convinced myself "if it worked locally, it works in prod" and the fact that the fallback was silent let me skip the obvious instrumentation. Lesson worth its own short post.
```

---

## "What's the cold-start latency post-restart?"

```
50–60 seconds for the first inference call after the container boots, then warm forever (KEEP_ALIVE=-1). Article has the numbers. Practically that means every deploy burns 60s of latency on the first user who triggers a Gemma call — not great, not terrible. Workaround if you cared more than I do: have the container hit Ollama with a warmup prompt as part of the docker compose up sequence.
```

---

## "Does this work with [other Ollama model]?"

```
Yeah, all the local stuff is just an Ollama HTTP call — the model name is one config line. Distractor parser is the surface that's most model-sensitive (qwen3 outputs differently than Gemma 4 differently than Llama). The one in the post is tuned for "single-word output". If you swap models, expect to re-tune that prompt.
```

---

## "Sample chapters / can I try it without signup?"

```
Yes — go to https://textstack.app, pick any book, hit "Read". Sample chapters are unauthenticated. Vocab review needs a free account because progress and SRS state are per-user, but there's no email verification gate. Use any throwaway email.
```

---

## "What's the SRS algorithm? Anki / SuperMemo?"

```
Custom 5-stage state machine — New → Recognition → Recall → Context → Mastered. Each stage uses a different review mode (multiple choice in early stages, classic flashcard later). It's not Anki — Anki is open-ended, TextStack's queue is intentionally capped (no infinite backlog). Code is at backend/src/Application/Vocabulary/SrsEngine.cs if you want to read it.
```

---

## "Where do the books come from?"

```
Two sources: a curated public library (mostly Project Gutenberg + Standard Ebooks for the technical/classics overlap), and user uploads (you can upload your own EPUB/PDF/FB2 and the worker extracts it). The interesting books for this audience — DDIA, Crafting Interpreters, SICP, the Pragmatic Programmer — are user uploads.
```

---

## "Isn't this basically a wrapper around Gemma 4?"

```
The Gemma part is one hop in a longer pipeline: parse EPUB/PDF/FB2 → extract chapters → search-vector index → reader UI → tap-word context detection → translation routing (cloud or local) → SRS scheduling → distractor generation → UX layer. Gemma's role is one chunk of the inference work — distractors, hints, explanations, metadata. Calling the whole product a wrapper would be like calling Stripe a wrapper around card networks. The model does its job; everything else is what makes it useful.
```

---

## "How do I contribute / what kind of PRs do you accept?"

```
Check CONTRIBUTING.md in the repo. Right now the highest-leverage PRs are: language-specific translation polish (Ukrainian/Russian especially — I can read those, but PR feedback from native speakers helps), bug reports with reproduction steps, and integration adapters for additional book sources beyond Gutenberg. The codebase is .NET 10 backend + React 19 frontend + React Native mobile.
```

---

## "How does this compare to LingQ / Kindle / Beeline / Readlang?"

```
Different audiences. LingQ is built for casual language learning at scale — broad vocabulary, conversational. TextStack is built for technical books specifically: domain-aware translation knowing whether "transaction" means a database thing or a financial one, integrated with an SRS that caps the queue weekly so you don't drown. None of those tools have local-LLM as the engine — they're all cloud-paid or freemium models with usage limits. The trade-off is real: TextStack's translation isn't as polished as paid services on conversational language, but it nails technical terms in a way none of them do.
```

---

## Crisis-mode replies

If someone calls you out for something you actually got wrong:

```
You're right. I had this wrong in the post — [acknowledge specific thing]. Going to update the article with a correction note. Appreciate the catch.
```

If someone says "this is just an ad":

```
The post is a writeup of a real bug I had to fix in production. Repo is open source, all the code I describe is linkable, the PRs are public. If there's a part you'd find more useful as a standalone technical reference without the project context, happy to pull it out.
```

If you get a flame about the AGPL:

```
AGPL was a deliberate choice, not an accident. Whether it's the right license for your use case is a different question — if you'd want to use this commercially under different terms, open an issue and let's talk. I'm not opposed to a dual-license discussion.
```
