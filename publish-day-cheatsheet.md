# Publish day cheat sheet — Monday, May 11, 2026

**Target publish time:** 08:30–08:35 ET (12:30–12:35 UTC)

**Pre-flight check (do tonight, Sunday):**

- [x] MCQ screenshot at `docs/marketing/srs-mcq-card.png` (extracted from your recording)
- [x] MCQ walkthrough gif at `docs/marketing/srs-mcq-demo.gif` (extracted from your recording, 37s, 2.0 MB)
- [ ] **Commit and push** the two new media files in `docs/marketing/` to `main` — required for the GitHub raw URLs in the article to resolve when Dev.to fetches them
- [ ] Claude Code SSH-prompt run, prod stats collected
- [ ] Final read-through of `devto-gemma4-article.md` done — any factual nits caught
- [ ] Phone alarm set for 08:00 ET

---

## Sunday evening (tonight) — 20 min

| When | Step |
|---|---|
| Now | `git add docs/marketing/srs-mcq-card.png docs/marketing/srs-mcq-demo.gif && git commit -m "docs: add MCQ vocab demo media for Gemma 4 challenge post" && git push` — needed before Dev.to can fetch the raw URLs |
| Now | Run the Claude Code SSH prompt (`claude-code-prod-stats-prompt.md`), save the report numbers |
| Tonight | Open the dev.to draft (see "Schedule the post tonight" below). Paste the article body — media is referenced by raw GitHub URL so no manual upload needed. Schedule for `2026-05-11 12:30 UTC` |

### Schedule the post tonight (recommended)

1. Open https://dev.to/new in a browser where you're logged in
2. Title: `I shipped local LLM features two months ago. Production never ran them once.`
3. Tags: `devchallenge` `gemmachallenge` `gemma` `ollama`
4. Cover image: click "Add a cover image" → "Generate image" → paste this prompt:

   ```
   Flat minimalist illustration: a server rack labeled "ollama" in the foreground,
   its model slot drawn as an empty glass cylinder. On the right, a fresh model
   container labeled "gemma4:e4b" sliding in. Faint code-trace lines glowing
   underneath in soft teal and purple. Wide banner aspect ratio, no people,
   no faces, dev.to-friendly clean style.
   ```

5. Paste body from `devto-gemma4-article.md` (the markdown block between the triple-backticks under `## Article body (paste into Dev.to editor)`). Both image references already point to `raw.githubusercontent.com/mrviduus/textstack/main/docs/marketing/...` — Dev.to fetches them server-side at publish time
6. If you got a real distractor count from the SSH prompt, edit the "What's next" paragraph to mention it
7. Click ⋯ "More options" → set **Schedule for**: `2026-05-11 12:30 UTC` (= 08:30 ET)
8. Click **Schedule**
9. Verify the draft is now scheduled (status should read "Scheduled" not "Draft")
10. Open the post-preview URL once to confirm both images render — if either fails, the most likely cause is the commit not being pushed yet (`git status` to verify)

If scheduling fails for any reason, fall back to: leave the draft saved, set a phone alarm for 08:00 ET, publish manually.

---

## Monday morning — minute-by-minute

| Time (ET) | Step | Reference |
|---|---|---|
| 08:00 | Wake, coffee, open laptop. Open: dev.to/dashboard, GitHub repo, Twitter, the social pack file | — |
| 08:25 | Verify scheduled post exists in dashboard. If not — publish manually NOW | — |
| 08:30 | Post auto-publishes. Copy the resulting URL. Refresh Dev.to to confirm it's live at https://dev.to/t/gemmachallenge/latest | — |
| 08:31 | React to your own post (👍 + 🦄 + 🔖) | DEV allows this |
| 08:32 | Open `social-media-pack.md`, find the URL placeholder in section 1 (Twitter), replace `[POST URL]` with the live URL | section 1 |
| 08:33–08:38 | Post the 5-tweet thread from `@Rexetdeus` | — |
| 08:38 | Pin the thread to your profile | — |
| 08:40 | Open `r/LocalLLaMA`, paste the post body from `social-media-pack.md` section 2. Submit | section 2 |
| 08:50 | r/selfhosted post (10-min gap to avoid cross-post detector) | section 3 |
| 09:00 | r/dotnet post | section 4 |
| 09:15 | HackerNews Show HN submission | section 5 |
| 09:30 | LinkedIn post | section 6 |
| 09:45 | Comment on the Gemma 4 Challenge launch post (Jess Lee thread) | section 7 |
| 10:00 | DM 5–10 friends from the personal-network template | section 8 |

---

## First 4 hours — engagement watch

| When | What |
|---|---|
| Continuous, every 15 min | Refresh dev.to post. Reply to every new comment within 10 min. Use templates from `comment-response-templates.md` if applicable |
| Continuous | Refresh r/LocalLLaMA + r/selfhosted + r/dotnet posts. Reply to every new comment within 15 min |
| Continuous | Refresh HN post. Reply within 10 min |
| 12:00 ET (lunch break in US East) | Check reaction count on the dev.to post. Compare against current `#gemmachallenge` Build leaderboard |
| 14:00 ET | Same check. If we're not yet in top-3 Build, do a second wave: ask 3 more personal-network contacts |

---

## End of day — measure + plan

By 18:00 ET, expect:

- Dev.to post: **20–40 reactions** (target: top 3 in `#gemmachallenge` Build)
- Twitter thread: 100+ impressions, 5+ likes (this is small but normal for tech content)
- Reddit total karma: 50–200 across all 3 subs (depends heavily on subreddit reception)
- HN: either dead or trending (binary outcome — front page or invisible by 14:00 ET)
- GitHub stars: +5 to +20 (delta from where you start the day)

Note your end-of-day numbers somewhere. They become the Day 0 baseline for the rest of the challenge.

---

## Daily routine until May 24 (deadline)

| Time | Daily task | Why |
|---|---|---|
| Morning | Refresh dev.to post, reply to overnight comments | Algorithm rewards reply velocity |
| Midday | Check `#gemmachallenge` Build leaderboard, note any new strong entries | Strategic awareness |
| Evening | If something worth riffing on appeared in the field, drop a substantive comment on it | Cross-pollinates readers |
| Daily | Note GitHub star delta | Tracks the secondary goal |

---

## Failure modes to avoid

- **Don't shadow-publish** — never publish at 02:00 ET to "get it out". Wasted boost window.
- **Don't reply with "thanks"** — reply with substance or skip.
- **Don't argue with bad-faith comments** — ignore. Real engagement comes from substantive replies, not flame wars.
- **Don't repost the same blurb across subs** — Reddit cross-post detector flags + each sub has its own tone (different bodies in `social-media-pack.md` for that reason).
- **Don't ask for stars/upvotes in comments** — only in the original post body or DMs. Asking in comments comes across as desperate.
- **Don't edit the post heavily after publish** — minor typo fixes OK; don't restructure or add new sections, you'll lose the engagement signal.
- **Don't promote Day 2+** — DEV's algorithm boost window is 24–48h. Don't post the same Reddit links again on Tuesday.

---

## Quick links (have these in tabs Monday morning)

- Dev.to dashboard: https://dev.to/dashboard
- The article (will be under your username): `https://dev.to/[your-username]`
- Challenge tag: https://dev.to/t/gemmachallenge/latest
- Build template URL (in case scheduled post failed and you need a fresh draft): https://dev.to/new?prefill=---%0Atitle%3A%20%0Apublished%3A%20%0Atags%3A%20devchallenge%2C%20gemmachallenge%2C%20gemma%0A---
- Repo: https://github.com/mrviduus/textstack
- Live: https://textstack.app
- r/LocalLLaMA: https://www.reddit.com/r/LocalLLaMA/submit
- r/selfhosted: https://www.reddit.com/r/selfhosted/submit
- r/dotnet: https://www.reddit.com/r/dotnet/submit
- HN submit: https://news.ycombinator.com/submit
