# Show HN Launch Post — TextStack

Submit at: https://news.ycombinator.com/submit

Positioning anchor: README's hero — "Deep-reading tool for developers learning AI engineering. Tap an unknown term → context-aware explanation inline. A modern replacement for Kindle Word Wise and LingQ — built for technical books."

Origin article (cite as "Why I built it" if asked): https://vasyl.blog/2026/04/21/i-quit-designing-data-intensive-applications-ddia-three-times-heres-what-i-build-on-the-fourth-try/

---

## URL field

```
https://textstack.app
```

## Title (pick one)

**Recommended (personal hook — strongest for HN):**
```
Show HN: I quit DDIA three times – built a reader that explains terms inline
```

Alternatives:
```
Show HN: TextStack – Kindle Word Wise for technical books, but LLM-powered
Show HN: TextStack – Tap a term in a tech book, get a context-aware explanation
Show HN: A reader that knows "attention" means ML in an ML book and biology in a bio book
```

Title rules HN actually enforces:
- No "the best", no "amazing", no marketing fluff
- Lead with a specific claim, not a category
- Under 80 characters
- "Show HN:" prefix is required

The recommended title works because (a) it's a personal admission HN respects, (b) DDIA is iconic enough that 80%+ of HN readers will recognize it instantly, and (c) "explains terms inline" is concrete.

---

## First comment (post immediately after submitting)

Hi HN,

I quit *Designing Data-Intensive Applications* three times. Not because it was hard — I understood most of what was on the page. The problem was the rest: unfamiliar terms that broke the flow. Eventual consistency. Attention mechanism. B-tree. Writing each one down to look up later works until you have 40 of them and you've already lost the thread.

Summarizing books away defeats the point. The only way to actually internalize something like DDIA or the Karpathy nanoGPT papers is to read them — but the friction has to go.

So TextStack works like this:

- Tap a term you don't know → 2-3 sentence LLM-powered explanation tied to the book's domain
- Tap "attention" in an ML textbook → ML meaning. Tap "attention" in a psychology book → cognitive meaning. Same word, different domain, different answer.
- Terms you didn't recognize go into a **capped weekly SRS queue** — no infinite backlog, no guilt spiral. Common words and the top 15K English words are filtered out, so only technical vocabulary surfaces.

The thing this replaces is Kindle Word Wise (static dictionary, 2014, falls over on technical terms) and LingQ (built for natural languages, not technical ones). I tried both before building this.

Stack:
- ASP.NET Core 10 (Minimal APIs, modular monolith) + PostgreSQL 16 + EF Core
- React 19 (web) + React Native / Expo 55 (mobile, Android live, iOS in TestFlight)
- OpenAI gpt-5-mini for explanations and translation; local Ollama qwen3:8b for SRS distractors
- Edge TTS over WebSocket for pronunciation (no API key, 200+ voices)
- Postgres FTS for search (Meilisearch swappable behind an interface)
- Puppeteer SSG for SEO pages — bot-detecting nginx routes crawlers to prerendered HTML, humans get the SPA
- OpenTelemetry → Aspire dashboard for traces
- Single docker compose, deploys via Cloudflare Tunnel

Honest limitations:
- Curated technical corpus is small right now (~15-20 hand-picked titles plus 1500+ classics). Personal uploads (EPUB/PDF/FB2) are unlimited.
- Explanation latency is ~1-2s on first call (cached after).
- iOS app is TestFlight-only — App Store review pending. Android is live on Google Play.
- Source-available, not OSI open source — BUSL-1.1, auto-converts to Apache-2.0 in 2030. Self-hosting for personal/internal use is fully allowed; reselling as a hosted service is not.

Try it without signing up:
https://textstack.app — sample chapters open without an account. Tap any unfamiliar term to see the explanation flow.

Things I'd love feedback on:
1. The capped SRS queue is a strong opinion — most SRS tools push infinite Anki-style backlogs and people drown. Does the cap make sense or do you want to override it?
2. Is "tap a term" the right interaction on desktop, or should there be a hover-to-preview alternative?
3. Curated corpus: which technical books would you want most? I'm prioritizing DDIA, Karpathy/Stanford ML papers, type theory, distributed systems classics. What am I missing?

Background article on the "why" if you want the longer version: https://vasyl.blog/2026/04/21/i-quit-designing-data-intensive-applications-ddia-three-times-heres-what-i-build-on-the-fourth-try/

— Vasyl (https://github.com/mrviduus, @Rexetdeus)

---

## When to post

**Best time for Show HN (US-centric audience):**
- Tuesday, Wednesday, or Thursday
- 8:00–10:00 AM Eastern Time (your local time, since you're in Toronto)
- NOT Monday morning (overflow from weekend), NOT Friday (lower attention)

**Why timing matters:** Show HN posts need ~3-5 upvotes in the first 30-60 minutes to escape /newest and reach /show. If you post at 3 AM ET, it'll be buried before US devs wake up.

---

## Pre-flight checklist

Before hitting submit, verify:

- [ ] textstack.app loads on first try (warm the cache)
- [ ] The "tap a term, get explanation" flow works on the chapter you'll link to
- [ ] No console errors on the demo page
- [ ] Sign-up via email/Google works end-to-end (test in incognito)
- [ ] Server has headroom — HN front page = 5-50K visitors in a few hours
- [ ] OpenAI billing has budget — explanations cost money per call, traffic spike could trigger a rate limit or 429
- [ ] Rate limits are sane (you have nginx zones for `/api`, `/uploads`, `/translate`)
- [ ] Status page or graceful fallback if API goes down
- [ ] HN account has karma > 0 and is at least a few days old (new accounts get filtered)

**OpenAI cost note**: at the worst case of 50K HN visitors × 5 explanations each × $0.0001/call, that's ~$25. Realistic case (5% try the demo, 3 explanations each) is ~$0.75. Fine, but watch the dashboard.

---

## After posting

**First hour is critical.** Do these in order:

1. Drop the first comment (the body above) within 60 seconds of submitting.
2. Pin the submission tab open. Refresh `news.ycombinator.com/show` after 15 min — your post should appear there.
3. Reply to every comment within the first 2 hours. HN ranks posts partially on author engagement.
4. Don't ask friends to upvote — HN detects vote rings and will flag the post.
5. Do post the link in your own networks (Twitter @Rexetdeus, LinkedIn, vasyl.blog) — organic traffic is fine.

**Common HN questions — prepared answers:**

*"How is this different from Readwise / LingQ / Kindle Vocabulary Builder?"*
> Readwise focuses on highlight management — surfacing what you already marked, not explaining what you didn't understand. LingQ is built for natural-language learning, not technical vocabulary; it doesn't know what "attention mechanism" means in context. Kindle Word Wise is a 2014 dictionary lookup — fine for general English, useless for "B-tree" or "monad". TextStack's bet is that LLMs finally make context-aware explanations cheap enough to do per-term, per-book.

*"Why BUSL and not just MIT?"*
> Because I want one paying customer by October. BUSL lets me self-host, lets you fork and modify, but blocks competitors from launching a hosted clone. In 2030 it auto-converts to Apache-2.0. If you don't agree with the license, the source is still on GitHub and you can read it.

*"Why ASP.NET? Isn't C# weird for this?"*
> It's what I'm fastest in. .NET 10 + EF Core + a modular monolith with central package versioning makes the codebase cheap to maintain solo. The mobile and web layers are React, which is most of the user-facing complexity anyway.

*"Have you tried [tool X]?"*
> Yes — I tried Kindle Word Wise (limited dictionary, no SRS), Anki + manual mining (the friction that broke me on DDIA), LingQ (wrong domain), and Readwise (different problem). The thing I couldn't find was "tap an unfamiliar term in a technical book and get a context-aware explanation".

*"What's the cost to run this for me self-hosted?"*
> Postgres + .NET API + Worker fits in a $10-20/mo VPS for a single-user setup. The biggest variable cost is OpenAI API for the explanations — figure $0.10-0.50/month per active reader. Ollama for distractors is free and local.

*"Will you add [feature]?"*
> The 6-month roadmap is in the README. Next up is iOS App Store, capped weekly SRS UX polish, and curating 15-20 AI-engineering titles (DDIA, ML papers). Beyond that, no commitments.

*"Is the explanation accurate? LLMs hallucinate."*
> They do. Right now I'm relying on gpt-5-mini being good enough that the 2-3 sentence explanation is right >95% of the time on technical terms. Users can flag bad explanations; I haven't built that loop yet. If you spot a hallucination on the demo, tell me — that's a real research gap.

---

## Backlinks angle (your secondary goal)

A successful Show HN gives you:
- 1 dofollow link from `news.ycombinator.com` (high-authority domain)
- Often 5-20 secondary mentions from blogs and aggregators that scrape the HN front page (Hacker News Daily, hckrnews.com, indie newsletters)
- Twitter / LinkedIn pickups from HN regulars
- Often Lobste.rs cross-post (another high-authority dofollow)

A flopped Show HN gives you:
- 1 nofollow link, no traffic, no backlinks
- And you can't repost the same title for 30 days

Translation: pick the right time, warm the demo, prepare the canned answers above. You only get one shot with this title.

---

## If it flops

Show HN posts that don't catch fire in the first 90 minutes are usually dead. If that happens:

- Don't repost the same title within 30 days — HN penalizes reposts.
- Wait 2-3 weeks, then submit a regular HN post (not "Show HN") with a different angle. Your DDIA blog article itself is HN-worthy as a standalone submission — title it something like *"I quit DDIA three times — here's what finally worked"* and link to vasyl.blog. The link to TextStack in the article does the work.
- Run Product Hunt launch first, then come back to HN with "We launched on PH last week, here's what we learned" — that's a fresh angle that usually performs.
- Lobste.rs is a smaller but higher-quality audience — needs an invite, but if you can get one, the developer-tools angle of TextStack will land well there.
