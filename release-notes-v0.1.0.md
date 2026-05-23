# v0.1.0 — First AGPL-3.0 release

First tagged release of TextStack as a public open-source project under
**GNU Affero General Public License v3.0**.

## Why this release

This release marks two milestones:

1. **TextStack is now real open-source software.** Earlier development
   happened under a source-available license (BUSL-1.1). All code in v0.1.0
   and beyond is AGPL-3.0 — OSI-approved, listed in awesome-selfhosted
   eligibility queue, and dual-licenseable for commercial customers.
2. **The product is feature-complete enough to use daily.** Reader, capped
   weekly SRS, vocabulary builder, reading stats, EPUB/PDF/FB2 uploads,
   offline mode, mobile apps — all working. See full changelog below for
   the granular history.

## Highlights

### Reader — context-aware explanations
- Tap a technical term, get a 2-3 sentence LLM-powered explanation tied to
  the book's domain (powered by OpenAI gpt-5-mini, swappable via
  `ILlmService`).
- Tap "attention" in an ML book → ML meaning. Tap it in a psychology book →
  cognitive meaning. Same word, different domain.
- Common words and the top 15K English words are filtered out — only
  technical vocabulary surfaces into your queue.

### Vocabulary SRS — capped weekly queue
- 5 stages: New → Recognition → Recall → Context cloze → Mastered.
- LLM-generated distractors and hints (Ollama qwen3:8b, runs locally).
- Review modes: multiple choice, classic flashcard.
- **Capped weekly queue** — no infinite Anki-style backlog, no guilt
  spiral.

### Library
- 1,500+ curated technical and classic books (starter corpus, self-
  hostable).
- Personal uploads: EPUB / PDF / FB2 with auto-parsing, metadata
  enrichment via local LLM.
- Reading progress sync, bookmarks, highlights, reading stats.

### Mobile
- React Native (Expo 55).
- Android live on Google Play.
- iOS in TestFlight (App Store review pending).
- Offline-first, same UX as web.

### Reading stats
- Heatmap calendar, streaks, daily/weekly goals.
- 20 achievements across milestone / streak / time / special categories.
- Session tracking with 30s heartbeat, 3min idle threshold.

### Edge TTS — pronunciation without API keys
- 200+ voices via direct WebSocket to Microsoft Edge Read Aloud.
- Two-layer cache (server disk + client IndexedDB).
- 0.75× to 2.0× speed.

## License

This release is licensed under
[**GNU Affero General Public License v3.0**](https://github.com/mrviduus/textstack/blob/main/LICENSE).

You may use, modify, and self-host TextStack freely for personal,
internal, or community purposes. If you modify TextStack and run it as a
network-accessible service, AGPL-3.0 requires you to publish your
modifications under the same license.

**Commercial license available** for organizations that need to use
TextStack without AGPL obligations. Contact: mrviduus@gmail.com.

## Tech stack

- ASP.NET Core 10 (Minimal APIs, modular monolith)
- PostgreSQL 16 + EF Core (snake_case)
- React 19 (web), React Native / Expo 55 (mobile)
- OpenAI gpt-5-mini (explanations, translation)
- Ollama qwen3:8b (local distractor generation)
- Edge TTS (WebSocket, no API key)
- Puppeteer SSG for SEO pages
- Docker Compose, Cloudflare Tunnel, nginx

## Self-hosting

```bash
git clone https://github.com/mrviduus/textstack
cd textstack
git checkout v0.1.0
cp .env.example .env  # edit with real values
docker compose up --build
```

Full instructions in [README](https://github.com/mrviduus/textstack#readme).

## Origin story

I quit *Designing Data-Intensive Applications* three times. Not because it
was hard — I understood most of what was on the page. The problem was the
rest: unfamiliar terms that broke the flow. TextStack is the fourth
attempt — and the one that finally worked.

Full story: [vasyl.blog/2026/04/21/...](https://vasyl.blog/2026/04/21/i-quit-designing-data-intensive-applications-ddia-three-times-heres-what-i-build-on-the-fourth-try/)

## What's next

- Submit to awesome-selfhosted (eligible after 2026-09-04 due to their
  4-month seasoning rule)
- iOS App Store release
- Capped weekly SRS queue UX polish
- Curated AI-engineering corpus (DDIA, ML papers, 15-20 titles)
- Goal: one paying customer by October 2026

## Try it

- **Hosted demo**: https://textstack.app — sample chapters open without
  signup
- **Source**: https://github.com/mrviduus/textstack
- **Mobile**: Google Play (Android), TestFlight (iOS)
- **Author**: [@Rexetdeus](https://twitter.com/Rexetdeus) /
  [vasyl.blog](https://vasyl.blog)

---

Star the repo if this resonates. That's the only signal I have right now
that I'm building the right thing.

— Vasyl
