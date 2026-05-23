# Social media pack — TextStack Gemma 4 launch

All ready to copy-paste. Order of execution is in the cheat-sheet (`publish-day-cheatsheet.md`). Replace `[POST URL]` with the published Dev.to URL once you have it.

GitHub-star ask is woven naturally into Twitter, Reddit, and LinkedIn. **Not** in HackerNews — HN downvotes star asks. The repo URL still gets visibility there.

---

## 1. Twitter / X — thread (5 tweets)

Post all 5 as a single thread from `@Rexetdeus`. Tweet 1 is the hook, tweet 5 has the CTAs.

**Tweet 1/5**

```
3 GB used out of 30. The model that runs all my LLM features should be ~13 GB.

I SSH'd in and ran `ollama list`.

Empty.

The container had been running for 60+ days without a single model pulled. Every distractor call had been silently failing.

Post-mortem ↓
```

**Tweet 2/5**

```
Production was running a hardcoded random-word fallback the whole time. The user sees distractors, just not LLM-generated ones — so I had no signal it was broken.

The fix took 3 PRs and surfaced four production-only bugs that toy benchmarks would never have caught.
```

**Tweet 3/5**

```
Worst offender: floating Docker image tags.

`image: ollama/ollama` froze at 0.22.x the day Docker pulled it. Two months later, upstream Ollama supports Gemma 4. My local "latest" doesn't.

The lie: `docker image ls` shows the cached SHA, not whether the registry has moved.
```

**Tweet 4/5**

```
The other surface that bit me: the parser quietly dropped half of Gemma 4's output because it filters multi-word phrases.

qwen3 (the model I'd planned for) emits single tokens by default. Gemma 4 prefers phrases. The parser was correct in spirit, hidden from the model.

Defend at parse, every time.
```

**Tweet 5/5 (CTAs)**

```
Full write-up with real numbers (9.6 GB disk, 13 GiB RAM, 2.8s warm inference) on dev.to:
[POST URL]

The product (open-source, AGPL-3.0, deployed):
https://github.com/mrviduus/textstack

If the angle resonated, a ⭐ on the repo helps the next person abandoning DDIA find this thing.
```

---

## 2. Reddit — r/LocalLLaMA

**Title:**

```
Production was empty for 2 months: lessons from actually shipping local Gemma 4 e4b on a $20 VPS
```

**Body:**

```
Two months ago I shipped local-LLM features in TextStack (open-source reader for technical books). Yesterday I checked production RAM and noticed the Ollama container was using 3 GB out of 30. The model should be 13.

`ollama list`: empty. The container had been running 60+ days without a single pull.

Wrote up the full post-mortem of the swap to Gemma 4 e4b — the four production-only bugs that surfaced (floating image tags, cgroup limits guessed for the wrong model, cold-load timeout vs API timeout, parser dropping multi-word output), the real numbers from a single-CPU 30 GB VPS (no GPU), and the cloud-vs-local cost split per task.

Post: [POST URL]
Repo (AGPL-3.0): https://github.com/mrviduus/textstack
PRs that wired it in: #232 (model swap) / #233 (parser fix) / #234 (timeouts)

Genuine ask: if anyone here has compared E4B vs E2B on technical-domain prompts, I'd value a sanity check on my "E4B is the smallest model that produces plausible distractors for terms like 'linearizability'" claim. That's the conclusion my testing reached but it's a small sample.
```

**Subreddit etiquette notes:**

- Don't post to multiple subs within 60 minutes of each other (cross-post detector flag)
- Don't reply with "Thanks!" — reply with substance or skip
- If someone says "this is just an ad", reply with one of: a specific technical detail from the post, a screenshot of the bug log, or a "fair, here's the part I think you'd actually find useful: [link to specific section]"

---

## 3. Reddit — r/selfhosted

**Title:**

```
Open-source reader with local LLM-generated vocabulary cards (Gemma 4 e4b on a $20 VPS, no GPU)
```

**Body:**

```
Made an open-source AGPL-3.0 reader for finishing dense English technical books in your native language. Tap any term → context-aware translation that knows the book's domain. Words you don't recognize feed a capped weekly SRS queue with LLM-generated distractor questions.

Two months ago I shipped the local-LLM side and immediately discovered the Ollama container had been silently empty since deploy — production was returning hardcoded random words instead of model output, and the user-facing failure mode was invisible. Just wrote up the post-mortem of swapping in Gemma 4 e4b that finally got the features working.

Stack: docker-compose, .NET 10, Postgres 16, Ollama (Gemma 4 e4b for distractors/hints/explanations + book metadata enrichment), OpenAI gpt-4.1-nano for translation. Everything runs on a single-CPU 30 GB VPS (no GPU). Deploy is a `git pull` and `docker compose up`.

Post: [POST URL]
Repo: https://github.com/mrviduus/textstack
Live deploy: https://textstack.app — sample chapters open without signup

The post goes into specifics on what broke when I actually flipped local LLM on (floating image tags, cgroup limits, cold-load timeouts, parser quirks). Hopefully useful to anyone planning to go local-LLM in their self-hosted stack.

Star helps if you'd use a tool like this — repo's open to PRs and the AGPL is real.
```

---

## 4. Reddit — r/dotnet

**Title:**

```
ASP.NET Core 10 + Ollama (Gemma 4 e4b) for fire-and-forget LLM jobs — production lessons
```

**Body:**

```
Wrote up the integration story of plugging Ollama into an ASP.NET Core 10 worker for vocabulary-related LLM jobs (distractor generation, hint generation, book metadata enrichment).

Architecture is fire-and-forget via `IServiceScopeFactory` — the API endpoint returns immediately and the LLM call happens in the background, with a fallback to a hardcoded random-word picker if Gemma fails or times out. Discovered after two months that the fallback path had been the only path running in production — silent fallback is the worst kind of bug.

Specific .NET-relevant bits in the post:
- Why I use `IServiceScopeFactory` for the fire-and-forget pattern (avoid disposed scope bugs)
- Bumping `Ollama:TimeoutSeconds` config from 10s → 30s after seeing 60s cold-load times
- The C# parser snippet that silently dropped half Gemma's output because of a `!Contains(' ')` filter that worked for qwen3 but not Gemma 4

Post: [POST URL]
Repo (AGPL-3.0): https://github.com/mrviduus/textstack
PRs: #232 (model swap), #233 (parser fix), #234 (timeouts)

Project is a self-hostable open-source reader for technical books (textstack.app). Stack: ASP.NET Core 10 / Postgres 16 / React 19 / docker-compose / Cloudflare Tunnel.

Stars on the repo help — it's not a SaaS, just AGPL code I run for myself and anyone else who wants it.
```

---

## 5. HackerNews — Show HN

**Title:**

```
Show HN: I rebuilt Kindle Word Wise on local Gemma 4 – production was empty for 2 months
```

**Body:**

```
TextStack is an open-source (AGPL-3.0) reader for developers who want to finish dense English technical books in their native language. Tap any term to get a context-aware translation that knows the book's domain ("attention" in an ML chapter gets the ML meaning, not the everyday one). Capped weekly SRS for terms you save.

Local Gemma 4 e4b runs the vocabulary-related LLM jobs (distractors, hints, explanations, book metadata) on a single-CPU 30 GB VPS with no GPU. OpenAI gpt-4.1-nano stays for multilingual translation where local models are weak.

Wrote up the swap to Gemma 4 e4b after discovering the Ollama container had been silently empty in production for 60+ days — the fallback path was a hardcoded random-word picker, indistinguishable to the user. Four production-only bugs surfaced when I flipped it on; the post has the diff for each.

Live: https://textstack.app
Code: https://github.com/mrviduus/textstack
Post: [POST URL]

Happy to answer questions on the .NET + Ollama stack, the model selection trade-off (E2B vs E4B vs 31B vs 26B MoE), or the SRS design.
```

**HN etiquette:**

- Submit between 7–9 AM ET on a weekday (max chance of front-page traction window)
- Title must start with `Show HN:` and use a hyphen-dash, not em-dash
- No emoji, no marketing language, no star asks
- Reply to every comment within 30 min for the first 2 hours — HN's algorithm rewards engagement velocity
- If someone calls it ad-bait, the substance of the post-mortem story carries the rebuttal

---

## 6. LinkedIn — single post

Less casual than Twitter, more "professional retrospective" tone. Star CTA is appropriate here — LinkedIn devs respond well to "support open source".

**Body:**

```
Two months of silent production failures, and what swapping to Gemma 4 surfaced about local LLM ops.

I shipped local-LLM features in TextStack (an open-source reader for technical books) two months ago. Last week I noticed the production server was using 3 GB of RAM out of 30. The model that powers all those features should be 13.

I SSH'd in. Ollama container: no models installed. The container had been running for 60+ days, every LLM call had been quietly hitting a hardcoded random-word fallback, and I had no signal because the failure mode was indistinguishable to users.

The post-mortem covers the swap to Gemma 4 e4b that finally got the features running, plus the four production-only bugs that surfaced along the way:

→ Floating Docker image tags lie about being "latest"
→ cgroup memory limits never re-evaluated when the model changed
→ Cold-load takes 60s, but my API timeout was 10s
→ The parser silently dropped half of Gemma 4's output because qwen3's behavior had hidden a constraint

Real numbers from a $20/month consumer VPS (no GPU): 9.6 GB on disk, 13 GiB RAM resident, 2.8 s warm inference.

Full write-up: [POST URL]

TextStack is open-source (AGPL-3.0) at https://github.com/mrviduus/textstack — if you've ever shipped local LLM features in production, a star helps the next person discover this story before they hit the same bugs.

#opensource #selfhosted #localllm #gemma4 #dotnet #llmops
```

---

## 7. Comment on the Gemma 4 Challenge launch post

Drop on https://dev.to/devteam/join-the-gemma-4-challenge-3000-prize-pool-for-ten-winners-23in within 30 min of publishing the article. Jess Lee actively reads that thread.

```
Submitted my entry today: a post-mortem of swapping qwen3 → Gemma 4 e4b in production, after discovering the Ollama container had been silently empty for two months. Honest numbers from a $20 VPS (no GPU), and the four production bugs that surfaced when I actually flipped local LLM on.

Build category — TextStack is the project: https://textstack.app

Post: [POST URL]

Thanks for organizing this challenge. The "intentional model selection" judging criterion was actually a useful prompt to write down why I picked E4B specifically vs. the other Gemma 4 variants — that's the kind of decision I usually don't document.
```

This works because: (a) it's substantive, not just "check out my post", (b) it credits the challenge for surfacing useful thinking, (c) Jess sees it.

---

## 8. Personal-network ask (DM template)

For sending to 5–15 friends/colleagues you actually know who care about local LLM, .NET, or open-source. Don't spray-paste — adjust to each person.

```
Hey [Name],

Published a post-mortem on Dev.to about silently shipping local LLM features that hadn't worked for two months in production — the swap to Gemma 4 e4b that finally got them running, and four bugs that surfaced.

Submitted to the Gemma 4 Challenge ($500 prize, judged on tie-break by reactions) so a 👍 + 🦄 on the post helps real money:
[POST URL]

If you'd star the repo too, that's the higher-value signal for me long-term:
https://github.com/mrviduus/textstack

No worries if you don't have time. Cheers.
```

Personal asks convert at 5-10× cold reach. Send within 60 min of publishing while the boost window is open.
