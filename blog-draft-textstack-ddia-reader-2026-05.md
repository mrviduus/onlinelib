---
title: "I gave up on Designing Data-Intensive Applications three times. So I built a reader to finish it."
date: 2026-05-19
tags: [textstack, open-source, side-project, indie-hacking, language-learning, reading]
canonical_url: https://vasyl.blog/2026/05/19/i-gave-up-on-ddia-three-times/
---

# I gave up on Designing Data-Intensive Applications three times. So I built a reader to finish it.

I gave up on *Designing Data-Intensive Applications* three times.

The third time, I built software to finish it. Six months later, that software is [TextStack](https://textstack.app) — open source, AGPL-3.0, free to use, free to self-host.

This is the story of why, what I built, and what three weeks of real usage data taught me.

## The friction

The problem wasn't the math. It was vocabulary.

Page 256 of DDIA uses "phantom" as a database isolation anomaly. The dictionary tells me it's a ghost. Google tells me it's a Rolls-Royce model. Kindle's Word Wise — same.

Every chapter has 5-10 words like that. "Trip" doesn't mean a journey; in transactions context it means a specific kind of read-write conflict. "Lease" isn't a rental agreement; it's a distributed-systems timing primitive. "Fence" doesn't keep cattle in; it's a memory ordering constraint.

For a native English speaker who works on databases, this is friction. For me — Ukrainian as a first language, English as a second — each lookup broke my concentration so completely that by the time I figured out what the word meant in context, I'd forgotten what the paragraph was about.

I gave up on chapter 7 three times. The third time, I sat down and asked: what if the reader knew what book it was reading?

## What I built

TextStack is a reader that knows what book it's reading.

Tap any word, and you get a 2-3 sentence explanation in the book's domain. "Phantom" in DDIA returns the database isolation meaning, not the ghost. "Trip" in a distributed systems book returns the read-write conflict meaning, not the journey.

The rest of what's in there:

- **Upload your own books** — EPUB, PDF, FB2 supported. No need to find them on TextStack's library; bring your own.
- **Vocabulary SRS** — words you tap get added to a spaced-repetition system with 5 stages (Recognition → Recall → Context → Mastered). I built it because Kindle's Vocabulary Builder is read-only; you can't actually drill the words you saved.
- **Built-in dictionary** — Free Dictionary API with phonetic pronunciation.
- **Translation via OpenAI** — for when a word makes no sense even in context.
- **Text-to-speech via Edge TTS** — through a direct WebSocket connection to Microsoft's service, no API key required. Two-layer caching so the same paragraph doesn't get re-synthesized.
- **Full-text search** across all your uploaded books — PostgreSQL FTS, not vector embeddings, because precision matters more than fuzziness for finding "the chapter where Kleppmann talks about lineage".

Stack: ASP.NET Core (.NET 10) + PostgreSQL backend, React + React Native (Expo) frontend. Self-host with `docker compose up`, or try the hosted version at [textstack.app](https://textstack.app) without signup.

Source code: [github.com/mrviduus/textstack](https://github.com/mrviduus/textstack).

## Three weeks of clean data

I ran TextStack quietly for six months. April 23rd I noticed Google Analytics showing 7,000 sessions a month with 1-second average engagement — turns out a directory had listed the site and was sending bot traffic. I removed it and the numbers normalized.

Here's what three weeks of clean data looks like:

- **25 unique users.** 19 new, 9 returning.
- **32 minutes** average engagement time per user.
- **8.2 sessions** per active user.
- **44 Google clicks** in the broader 3-month window. Position 60+ on most queries — I'm fighting Project Gutenberg, Standard Ebooks, and Goodreads for the same long-tail "free books" searches, and TextStack is six months old with no backlinks.

Of those 25 users, most are people I shared the project with directly — friends, dev acquaintances, Twitter followers who clicked through. The nine organic strangers come from the US, Ireland, Pakistan, Colombia. Tiny absolute numbers, but globally distributed in exactly the demographic pattern I expected: non-native English speakers reading technical books in English.

The engagement metric is what keeps me going. 32 minutes per user is not a "quick visit" pattern. The people who find TextStack actually use it.

## What this taught me

Three things I didn't expect when I started:

**Niche audiences are real but hard to find.** My target is non-native English speakers reading technical books in English. Globally there are probably millions of them. But they're not concentrated anywhere — not one country, not one subreddit, not one Slack. Finding them one at a time is the actual hard problem, harder than the product.

**Engagement metrics matter more than acquisition metrics at this stage.** I spent six months obsessing over SEO when I had 25 users. The SEO matters eventually, but you cannot bootstrap distribution from 25 users to 50,000 through SEO alone. You need a small group of people who love the product enough to talk about it before SEO compounds.

**Open source attracts different people than free SaaS.** When I switched from BUSL to AGPL three weeks ago, the conversation around TextStack changed. The people who showed up after AGPL were more technical, asked about self-hosting, wanted to read the code. The free-tier-vs-paid mental model didn't apply. That changed how I think about distribution.

## What's next

Three months of focus, in order:

1. **Get to 100 real users who chose TextStack over alternatives.** Not 100 sign-ups — 100 people who came back at least three times. Through community engagement, build-in-public on Twitter, posts on Indie Hackers and Dev.to. Direct conversation, not paid acquisition.
2. **Improve the metadata pages so they actually rank.** SEO backfill through Claude is already generating descriptions, themes, and FAQs for each book and author. Need to verify the quality and scale to all ~400 indexable pages.
3. **Build the chapter-by-chapter analysis layer** — unique value that doesn't compete with Project Gutenberg's text. If I have summaries, themes, and a tap-to-explain layer, I'm not duplicating their work; I'm adding to it.

If you've ever quit a technical book, I'd love to hear what made you put it down. If it was vocabulary, TextStack might help — try it at [textstack.app](https://textstack.app) and tell me what didn't work. If it was something else, that's even more useful — comment below or [find me on Twitter](https://twitter.com/Rexetdeus).

---

*TextStack is open source under AGPL-3.0. Source: [github.com/mrviduus/textstack](https://github.com/mrviduus/textstack). Live at [textstack.app](https://textstack.app).*
