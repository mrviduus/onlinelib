# Twitter/X drafts for @Rexetdeus

Three options, in order of recommendation. Pick one or post the thread.

---

## Option A — single tweet (recommended for first announcement)

```
TextStack v0.1.0 is out 🚀

A reader for technical books with LLM-powered context-aware term explanations and a capped weekly SRS queue. Built it after I quit DDIA three times.

Now AGPL-3.0, self-hostable.

https://github.com/mrviduus/textstack/releases/tag/v0.1.0
```

Char count: 251 / 280 — fits.

Why it works:
- Specific, not vague ("a reader for technical books" not "a learning tool")
- Personal hook ("after I quit DDIA three times") — devs relate
- Clear CTA (GitHub release link)
- Mentions AGPL-3.0 — signals real open source

---

## Option B — license-focused (use 1-2 days after Option A)

```
Just relicensed @textstack from BUSL-1.1 to AGPL-3.0.

The "AWS forks my project" scenario felt 1% likely vs. real costs of being source-available: locked out of awesome-selfhosted, contributor friction, brand confusion.

Wrote about why: [link to vasyl.blog post]
```

Char count: ~270.

This one drives traffic to the blog post. Post after the blog post is published.

---

## Option C — Show HN style thread (for a second wave)

Tweet 1/4:
```
1/ I quit Designing Data-Intensive Applications three times.

Not because it's hard. Because of the unfamiliar terms — eventual consistency, attention mechanism, B-tree — that broke my flow until I lost the thread.

So I built a reader that fixes that. v0.1.0 ships today.
```

Tweet 2/4:
```
2/ Tap an unfamiliar term, get a 2-3 sentence LLM-powered explanation tied to the book's domain.

"Attention" in an ML book → ML meaning.
"Attention" in a psych book → cognitive meaning.

Same word, different domain, different answer.
```

Tweet 3/4:
```
3/ Surfaced terms enter a *capped weekly* spaced repetition queue.

No infinite Anki backlog. No guilt spiral. The cap forces curation.

5 stages: New → Recognition → Recall → Context cloze → Mastered.
```

Tweet 4/4:
```
4/ TextStack v0.1.0:
✓ Self-hosted, AGPL-3.0
✓ Web + Android (iOS in TestFlight)
✓ 1500+ books in the public library
✓ Your own EPUB / PDF / FB2 uploads
✓ ASP.NET Core + React + Expo

Try without signup: https://textstack.app
Source: https://github.com/mrviduus/textstack
```

This thread is HN-bait — could be screenshot-cross-posted later.

---

## Hashtags strategy

Don't add hashtags to Option A — they dilute the reach on X's algorithm now. For Option B and C, max 1-2 hashtags AT THE END:

`#opensource #buildinpublic`

(Not in the middle of the tweet, not more than 2.)

---

## When to post

- **Option A**: post within 24h of v0.1.0 release while it's fresh
- **Option B**: 1-2 days after blog post is published on vasyl.blog
- **Option C**: 3-5 days after Option A, on a Tuesday/Wednesday morning ET when dev Twitter is most active

---

## Mention strategy

People to consider tagging in replies (not in the main tweet — looks spammy):

- @plausiblehq — if they engage with Option B (you mentioned them in the blog post about AGPL)
- @PostHog, @cal_com — same reasoning
- Indie hackers you know

Don't tag celebrities or big accounts you don't know — looks like begging.

---

## After posting Option A

- Pin the tweet to your profile
- Reply with the link to the blog post when it's published
- Reply with a short demo GIF if you can record one (use the `gif_creator` tool from Claude in Chrome later)
- DM 5-10 indie devs you know personally with a "would love your feedback" note linking the tweet
