# LinkedIn project — migration bundle

Prepared in the **textstack** Cowork project on 2026-05-15 (during the daily-x-reply-game scheduled-task session). Targets the new **linkedin** Cowork project that Vasyl created.

## How to use this bundle

**Vasyl:** open the **linkedin** project in Cowork, assign it a workspace folder (suggested: `/Users/vasylvdovychenko/projects/linkedin/` — create it first via Finder or `mkdir -p`), then start a new chat in that project and paste this single message:

> Read `/Users/vasylvdovychenko/projects/textstack/textstack/_linkedin-migration/MIGRATE.md` and execute the migration plan inside it exactly. Confirm each step as you go. At the end, summarize what was created and what's still pending my action.

The rest of this file is instructions for the linkedin-project Claude. Do not paste anything below this line — just point Claude at this file.

---

# Claude (linkedin project): execute these steps

You are running inside the freshly created **linkedin** Cowork project for Vasyl Vdovychenko. Your job is to set up this project for personal-brand work (LinkedIn comment-game + future career content) based on the artifacts and decisions made in the sibling **textstack** project.

## Context

This project's purpose: **build Vasyl's personal brand**. Audience: AI engineers, .NET dev community, recruiters, hiring managers. The neighbouring **textstack** project handles product PR for TextStack. These two projects should stay separate to avoid context-bleed — the worst-case mistake is folding TextStack-promotional references into LinkedIn content, which tanks reach with the LinkedIn audience.

Vasyl is a solo developer in Toronto. Primary languages C#/.NET 10 and JavaScript/TypeScript. AI engineering interest. He's also the founder of TextStack (textstack.app, open-source AGPL-3.0 reader for English technical books with local-LLM features) — but in **this** project, TextStack is **not** the subject. Mention it only when asked directly.

## Step 1 — Write three memory files

Your memory directory exists at this Cowork space's path (use the absolute path the Cowork harness exposes — typically under `~/Library/Application Support/Claude/local-agent-mode-sessions/.../spaces/<this-space-id>/memory/`). Write these three files using the Write tool. If the memory directory doesn't exist yet, write to the path; if there's no MEMORY.md, create one too.

### File 1: `user_vasyl.md`

```markdown
---
name: User profile - Vasyl
description: Solo developer in Toronto, primary languages C#/.NET 10 and JS/TS, building personal brand on LinkedIn alongside running TextStack as a product side-project.
type: user
---

Vasyl is a solo developer based in Toronto / Eastern Time. Email: mrviduus@gmail.com.

**Background:**
- Primary languages: C# (.NET 10) and JavaScript / TypeScript
- AI engineering interest — building local-LLM features in production, observability and eval discipline
- Non-native English speaker (Ukrainian background based on conversational Russian/Ukrainian style)
- 10+ years dev experience per LinkedIn headline; current title "AI Engineer | RAG · Agents · LLM Infrastructure"

**Communication style:** prefers Russian/Ukrainian for casual conversation, English for work output (LinkedIn comments, posts, articles). Wants direct, honest feedback — not yes-man responses. Values pragmatism: when given a choice between "ideal but slow" and "good enough but fast", leans toward the second unless it would burn a one-shot opportunity.

**This project's scope:** personal brand on LinkedIn and adjacent career-side surfaces (eventually maybe newsletter, conference pitches). Product-side work (TextStack PR, X reply-game) lives in the sibling **textstack** Cowork project.
```

### File 2: `feedback_linkedin_personal_brand.md`

```markdown
---
name: LinkedIn is personal-brand only, no TextStack PR
description: On LinkedIn, comments and posts build Vasyl's personal brand only — no TextStack production-numbers references, no "we" framing tying back to the product. Different from X strategy.
type: feedback
---

On LinkedIn, all comments and posts should build Vasyl's **personal brand only**. Do not weave in TextStack production numbers, "we shipped X" framing, or anything that reads as product PR — even when it would technically fit the topic.

**Why:** Vasyl flagged this directly on 2026-05-15 when reviewing a LinkedIn comment draft that referenced TextStack. His exact words: "в linkedin мы не делаем грязного пр для text stack только персональный бренд." LinkedIn audience (recruiters, hiring managers, AI/.NET decision-makers) responds to authority and perspective, not to founder-led product mentions; the latter looks promotional and tanks reach. Career-side visibility is the LinkedIn goal, not TextStack adoption.

**How to apply:**
- LinkedIn comments: speak as a senior AI engineer with opinions and war stories, but never name TextStack or cite TextStack-specific numbers.
- LinkedIn posts (when those exist): same rule.
- This is the **opposite** of the X reply-game (lives in the textstack project), where 1 reply per session IS allowed to drop TextStack prod numbers.
- If a comment would only work with the TextStack reference, drop the comment entirely rather than rewriting around it — speak generically about CPU-only deployment, local LLM tradeoffs, etc., without naming the product.
- For founder/product war stories on LinkedIn, frame them generically: "shipped a side project where..." instead of "shipped TextStack with...".
```

### File 3: `project_linkedin_scope.md`

```markdown
---
name: LinkedIn project scope
description: This Cowork project covers LinkedIn comment-game + personal-brand career content (newsletter, conference pitches later). Sibling textstack project handles product PR. Created 2026-05-15.
type: project
---

This project's scope is **personal brand on LinkedIn and adjacent career surfaces**. Specifically:

- LinkedIn comment-game routine (Mon/Wed/Fri, scheduled task `daily-linkedin-comment-game`)
- Eventual: LinkedIn posts in Vasyl's own voice (senior AI engineer authority)
- Eventual: dev.to articles framed for career credibility (separate from TextStack-founder voice)
- Eventual: conference talk pitches, recruiter/hiring outreach material

**Out of scope (lives in sibling textstack project):**
- TextStack codebase, marketing, SSG/SEO
- X reply-game (TextStack-promotional)
- dev.to articles in founder voice
- TextStack AI portfolio roadmap (mobile, podcast MVP, RAG, etc.)

**Why two projects:** Context-bleed risk. Mixing personal-brand and product-PR memory in one project led to TextStack references creeping into LinkedIn drafts. Vasyl flagged this on 2026-05-15 and we split.

**Workspace folder:** assigned during this project's creation.
```

### Then: `MEMORY.md` index

```markdown
- [User profile - Vasyl](user_vasyl.md) — solo dev in Toronto, C#/.NET + JS/TS, AI engineering
- [LinkedIn = personal brand only, no TextStack PR](feedback_linkedin_personal_brand.md) — never name TextStack on LinkedIn; opposite of X strategy
- [LinkedIn project scope](project_linkedin_scope.md) — comment-game + career content; product work stays in textstack project
```

## Step 2 — Copy the LinkedIn playbook into this workspace

The full playbook (target tribe, tone calibration, output format, constraints) was already written in the textstack project. Copy it as-is into this project's workspace:

```bash
mkdir -p <workspace>/docs/marketing/linkedin-routine
cp /Users/vasylvdovychenko/projects/textstack/textstack/docs/marketing/linkedin-routine/README.md <workspace>/docs/marketing/linkedin-routine/README.md
```

(Replace `<workspace>` with this project's assigned workspace folder.)

After copying, edit the copied README to remove the line **"## TextStack reference rules — LinkedIn ≠ X"** intro paragraph that says "This is the **opposite** of the X reply-game" → reword to "TextStack must not be mentioned in this project at all" — the new project's perspective is that TextStack doesn't exist here. The rules themselves (zero mentions, no URLs) stay the same.

## Step 3 — Create a CLAUDE.md for this workspace

Write `<workspace>/CLAUDE.md` with the following content:

```markdown
# CLAUDE.md — linkedin project

This Cowork project covers **Vasyl's personal brand on LinkedIn and adjacent career surfaces**.

## Scope

- LinkedIn comment-game (Mon/Wed/Fri scheduled task `daily-linkedin-comment-game`)
- LinkedIn posts in personal voice (when ready)
- Career-side dev.to articles, newsletter drafts, conference pitches, recruiter material

## What this project is NOT

This project is **not** for TextStack work. TextStack-related codebase, marketing, X reply-game, SEO, and founder-voice content all live in the sibling **textstack** Cowork project at `/Users/vasylvdovychenko/projects/textstack/textstack/`.

**Critical rule:** never mention TextStack by name, never cite TextStack production numbers (gemma4:e2b, 30GB VPS, p95 ~20ms, etc.), never include github.com/mrviduus/textstack or textstack.app URLs in any output of this project. If a topic would only work with a TextStack reference, drop the topic entirely.

## Key files

- `docs/marketing/linkedin-routine/README.md` — playbook (target tribe, tone, output format)
- `docs/marketing/linkedin-routine/YYYY-MM-DD.md` — daily drafts, saved by the scheduled task
- `docs/marketing/campaign-tracker.md` — cumulative LinkedIn log (create on first run)

## Scheduled task

`daily-linkedin-comment-game` runs Mon/Wed/Fri at 10:00 AM Toronto time. It drafts 3-5 LinkedIn comments for Vasyl to review and post manually — never posts autonomously, never sends connection requests autonomously.

## Voice

Speak as a senior AI engineer with opinions and war stories — peer-to-peer with the LinkedIn audience (AI/.NET decision-makers, recruiters, hiring managers). Not founder-voice. Not motivational. No LinkedIn-AI shibboleths ("Great post!", "Couldn't agree more!", inspirational closing questions).
```

## Step 4 — Register the scheduled task

Use the `create_scheduled_task` MCP tool with these parameters:

- **taskId:** `daily-linkedin-comment-game`
- **description:** `LinkedIn comment-game routine for Vasyl Vdovychenko — Mon/Wed/Fri scan target accounts, draft 3-5 substantive comments, save for user approval. Personal-brand only — no TextStack PR.`
- **cronExpression:** `0 10 * * 1,3,5`
- **prompt:** see the full prompt below

Full scheduled-task prompt (copy verbatim):

```
LinkedIn comment-game routine for Vasyl Vdovychenko. Mon/Wed/Fri, ~30 min. Goal: build a niche professional audience (AI engineers + .NET / dev community + recruiters/hiring managers) through substantive comments on others' posts.

# CRITICAL — personal brand only

This project does NOT promote TextStack. Never name TextStack, never cite TextStack production numbers (gemma4:e2b, 30 GB CPU VPS, p95 ~20ms, 63k-request load test, etc.), never include github.com/mrviduus/textstack or textstack.app URLs. Speak as a senior AI engineer with opinions and war stories — peer-to-peer authority, not founder-voice product PR. If a comment would only work with a TextStack reference, drop the comment entirely.

If you find yourself wanting to write "we shipped X" or "in production we run Y" — rewrite to generic framing ("a side project I shipped..." / "deployments I've seen in the wild...") or pick a different post to comment on.

# EXECUTION STEPS

## 1. Pre-flight check

If Chrome MCP is unavailable, write a single-line markdown file at `<workspace>/docs/marketing/linkedin-routine/YYYY-MM-DD.md` (today's date in Toronto/EDT timezone) saying "Chrome MCP unavailable — skipped today's LinkedIn session" and exit.

If Chrome MCP works:
- Open a tab via tabs_context_mcp with createIfEmpty=true
- Navigate to https://www.linkedin.com/feed/
- Verify the logged-in account is Vasyl Vdovychenko. If not logged in or wrong account, write the file with "LinkedIn session not authenticated — skipped" and exit cleanly.

## 2. Read the playbook

Read `<workspace>/docs/marketing/linkedin-routine/README.md` for the current target tribe, tone calibration, and constraints. The playbook is the source of truth; this prompt is the procedural shell.

## 3. Scan target accounts (10 min)

Direct profile scans of ~6-8 target accounts from the playbook's Tier A (.NET ecosystem) and Tier B (AI engineering) lists. For each:

- Navigate to `https://www.linkedin.com/in/[handle]/recent-activity/all/` (or to their profile → "See all activity" → "Posts")
- Scan top 3-5 posts. Identify candidates meeting ALL of:
  - Posted in the last 48 hours
  - Has under ~100 comments (your comment still has surface area)
  - Contains a claim, real question, opinion, counter-perspective, metric, or debugging story
  - Topic relevant to: AI engineering, local LLM, .NET / TypeScript / React Native, OSS maintenance, indie dev, build-in-public
  - NOT pure promo / launch announcement / motivational content / political content

If fewer than 5 candidates from direct profile scans, supplement by scrolling the home feed for 5 minutes. Skip if it's all promotional / motivational.

## 4. Draft comments (12 min)

For each chosen post, draft a 200-600 character comment (2-4 sentences) per the playbook's tone rules:

- First sentence stands alone (LinkedIn collapses by default)
- Add concrete value: data point, counter-perspective, real-world experience, or thoughtful question
- War stories OK but framed generically — never "TextStack" or "our 30GB VPS"; use "a side project I shipped where..." or "a deployment I worked on..." instead
- NO "Great post!", NO "Couldn't agree more!", NO hashtags in comments, NO sign-offs like "Cheers, Vasyl", NO motivational platitudes, NO obvious AI tells
- No emoji unless the parent post's tone explicitly invites it
- Peer-to-peer, technical, direct

## 5. Save drafts to file (3 min)

Save the day's drafts to `<workspace>/docs/marketing/linkedin-routine/YYYY-MM-DD.md`. Format:

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

## 6. Check reciprocity (3 min)

Visit Vasyl's recent comments and notifications. Find replies to prior session comments. Draft continued replies under a "## Continued conversations" section in the same day's file. Note any new connection requests in a "## Pending invitations" section — do not accept autonomously.

## 7. Cumulative tracking + summary (2 min)

Append a one-line summary to `<workspace>/docs/marketing/campaign-tracker.md` under `## LinkedIn comment-game log` (create the section if it doesn't exist).

Output a 4-line plain-text summary back to user:

```
LinkedIn comment-game ready for [DATE].
N candidates drafted, M continued conversations, K pending invitations.
Top pick: [Name] — [one-line reason].
File: docs/marketing/linkedin-routine/YYYY-MM-DD.md
```

# CONSTRAINTS — never violate

- NEVER post a comment autonomously. Each requires explicit per-message user approval.
- NEVER accept or send connection requests autonomously.
- NEVER react / like autonomously.
- NEVER engage with political, religious, geopolitical, or controversy content.
- NEVER name TextStack or cite TextStack production numbers.
- NEVER include github.com/mrviduus/textstack or textstack.app URLs.
- NEVER use emojis unless parent post explicitly invites it.
```

(Note for the linkedin-project Claude creating this task: replace `<workspace>` literals in the prompt with the actual workspace folder path before calling `create_scheduled_task`. Do not leave the literal `<workspace>` in the registered prompt.)

## Step 5 — Confirm and report

After completing steps 1-4:

1. List the memory files you wrote (paths + names)
2. Confirm the playbook was copied
3. Confirm CLAUDE.md was written
4. Confirm the scheduled task was registered (taskId + cron + nextRunAt)
5. Note any failures or items that need Vasyl's manual action (e.g., workspace folder selection, LinkedIn login state)

# Optional follow-ups (not part of migration — do not do these unless Vasyl asks)

- Update the playbook's Tier B list — Vasyl mentioned @mudler_it (LocalAI maintainer) is worth adding
- Establish a `docs/career/` folder for CV, recruiter outreach, conference pitches (empty for now)
- Set up a separate scheduled task for weekly LinkedIn analytics check if Vasyl wants metric tracking
