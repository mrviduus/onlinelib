# LinkedIn comment-game playbook

Companion to `docs/marketing/x-routine/`. Runs **Mon/Wed/Fri at 10:00 AM Toronto** via the `daily-linkedin-comment-game` scheduled task. Goal: build a niche professional audience (AI engineers + .NET / dev community) through substantive comments on others' posts — same engagement philosophy as the X reply-game, but tuned for LinkedIn's different mechanics.

## Why LinkedIn

- LinkedIn's algorithm rewards **dwell time on comments** more than reactions; a 3-sentence substantive comment outperforms 10 likes.
- The audience is older, more decision-shaped (technical leads, hiring managers, founders), conversion to actual contributors / TextStack users is much higher per impression than X.
- Reply windows are longer — a comment posted 24h after the parent post still gets visibility, unlike X where the 1-3h window is hard.

## Tone & format vs. X

| | X reply | LinkedIn comment |
|---|---|---|
| Length | 100-280 chars | 200-600 chars (2-4 sentences) |
| Hook | Optional | First sentence must stand alone — LinkedIn collapses by default |
| Emoji | Max 1, rare | None unless matching parent's tone exactly |
| Hashtags | Never | Never in comments (only in own posts) |
| Sign-off | None | None (no "Cheers, Vasyl" — looks AI-generated) |
| Persona | Peer-to-peer, terse | Peer-to-peer, slightly more formal but still direct |

## Target tribe — priority order

These are **names**, not URLs. The scheduled-task run will need to search LinkedIn for each. The pool is intentionally larger than the X list because LinkedIn surfaces a smaller subset of any given person's posts per visit.

**Tier A — .NET / Microsoft ecosystem (highest topical overlap with TextStack stack):**
- Scott Hanselman (Microsoft, .NET evangelism)
- David Fowler (.NET architect)
- Damian Edwards (.NET PM)
- Khalid Abuhakmeh (JetBrains, .NET advocacy)
- Maarten Balliauw (.NET, Azure)
- Jeff Fritz (Microsoft .NET community)
- Andrew Lock (.NET author)
- Steve Smith (Ardalis, .NET architecture)

**Tier B — AI engineering / local LLM ecosystem:**
- Simon Willison (Datasette, llm CLI)
- swyx (Latent Space)
- Andrej Karpathy (sporadic on LinkedIn but high-value)
- Mitchell Hashimoto (HashiCorp founder, recent solo AI work)
- Harrison Chase (LangChain)
- Aravind Srinivas (Perplexity)
- Logan Kilpatrick (Google AI / DeepMind)
- Eduards Sizovs (sizovs.net — dev architecture content, strong LinkedIn)

**Tier C — Indie / build-in-public (highest reply-back rate):**
- Arvid Kahl (FeedbackPanda, Podscan)
- Pieter Levels (post sometimes on LinkedIn)
- Marc Lou
- Daniel Vassallo
- Sahil Lavingia

**Tier D — Recruiter / hiring-adjacent (low engagement priority but parallel benefit):**
- Gergely Orosz (Pragmatic Engineer)
- Ryan Peterman (FAANG-focused content)

## What to comment on

- A post with a **claim** (architecture take, performance number, framework opinion) — counter or extend with a data point.
- A post with a **question** asked sincerely — answer it concretely.
- A post sharing a **debugging story** — share a parallel war-story (this is where TextStack production experience naturally fits).
- A post about **AI / local LLM tradeoffs** — peer-to-peer technical perspective.

## What to skip

- Pure promotion ("excited to announce" / launch posts) — engagement value is low; LinkedIn already amplifies these.
- Long-form opinion threads with 200+ comments already — your comment drowns.
- Posts older than 48 hours — LinkedIn algorithm has decayed by then.
- Political / current-events posts — same tribe constraints as X.
- "Inspirational" / motivational posts — wrong tribe.

## TextStack reference rules — LinkedIn ≠ X

LinkedIn is **personal brand only**. Do not name TextStack, do not cite TextStack production numbers, do not use "we shipped X" framing that ties back to the product. This is the **opposite** of the X reply-game (where 1 reference per session is allowed and working).

- **Zero** TextStack mentions per session — no exceptions, even when it would topically fit.
- **Never include** github.com/mrviduus/textstack or textstack.app URLs.
- If a comment would only work with a TextStack reference, **drop the comment entirely** rather than rewriting around it. Speak generically about CPU-only deployment, local LLM tradeoffs, etc., without naming the product.
- Speak as a senior AI engineer with opinions and war stories — authority + perspective, not founder-led product PR. Recruiters and hiring managers respond to the former and tune out the latter.

## Constraints (never violate)

- **Never post a comment autonomously.** Each comment requires explicit per-message approval from the user. Scheduled task drafts; user approves and posts (or asks Claude to post once approved).
- **Never send connection requests autonomously.**
- **Never react / like autonomously** — that changes profile-side state.
- **Never engage with political, religious, geopolitical, or controversy content.**

## Output format

Save drafts to `docs/marketing/linkedin-routine/YYYY-MM-DD.md` in this format:

```markdown
# LinkedIn comment-game drafts — [DATE]

Generated by daily-linkedin-comment-game scheduled task.
N candidates selected. Pending user review and per-comment approval before posting.

---

## Candidate 1 — [Name] ([Title at Company])

**Source post:** [LinkedIn URL]
**Posted:** [N hours ago]
**Excerpt:** "..." (2-3 lines of the original)

**Draft comment:**
> [comment text — 200-600 chars]

**Why this adds value:** [one line of reasoning]

---

[continue for 2-5 candidates]
```

## Cumulative tracking

Append a one-line summary to `docs/marketing/campaign-tracker.md` under a new section `## LinkedIn comment-game log` after each session — mirror the X routine log format.

## Calibration

- Weekly: 1-3 new connections expected by week 4 (lower volume than X follows but higher per-touch conversion)
- Monthly: 10-30 new connections by month 1
- A comment has succeeded if it (a) gets a reply from the original poster, or (b) prompts a connection request from another commenter
- A session has succeeded if 3+ candidates were drafted with substantive value

## Notes for the runtime

The current LinkedIn URL for the @Rexetdeus / TextStack account is **unverified** — the scheduled task should first navigate to `https://www.linkedin.com/feed/` and confirm the logged-in user matches Vasyl Vdovychenko before scanning. If the session isn't logged in, write a one-line markdown file at `docs/marketing/linkedin-routine/YYYY-MM-DD.md` saying "LinkedIn session not authenticated — skipped" and exit cleanly.
