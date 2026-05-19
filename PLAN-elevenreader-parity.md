# TextStack Roadmap: Reading-first Growth Plan

**Last updated**: 16 April 2026
**Product**: [textstack.app](https://textstack.app/) — reading-first language learning
**Reference competitors**: LingQ (vocab reader), Kindle (reading UX), Readwise Reader (capture), ElevenReader (audio-first — *not* our direct competitor)

---

## Positioning reset

Previous versions of this plan treated ElevenReader as the template to copy. That was wrong. ElevenReader is an **audio-first** product — its core loop is listen, not read. TextStack's core loop is read, with tap-to-translate, vocab SRS, and offline sync. TTS is a supporting feature, not the headline.

**New one-liner**: *TextStack is LingQ's reading experience + Project Gutenberg's free catalog + Readwise's vocabulary review, in one app.*

**Headline hierarchy**:
1. Read real books in a new language
2. Tap any word → instant translation
3. Save words → spaced repetition builds vocab
4. (Supporting) TTS, offline, stats, cross-device sync

This unblocks everything downstream — copy, pricing, feature priorities all flow from being reading-first.

---

## What exists today

**Reader**: tap-to-translate (18+ languages), dictionary popup, highlights, bookmarks, vocab marks
**SRS**: 5-stage spaced repetition, multiple choice + context cloze, LLM-generated distractors (Ollama gemma4:e4b)
**Catalog**: 146 books, 47 authors, 20 genres, SSG-prerendered SEO pages
**User uploads**: EPUB + PDF + FB2 → extraction → chapters + metadata enrichment (Ollama)
**Stats**: sessions, streaks, 20 achievements, heatmap, goals
**Offline**: IndexedDB cache, downloadable books, pending-save queue
**TTS**: Edge TTS, 200+ voices, two-layer cache (server + client), word-level highlighting shipped
**Blog**: admin CMS, comments, likes, SSG
**Mobile**: Expo 55 / React Native, 29 screens, ready for store submission
**Infra**: Meilisearch, auto-publish pipeline, SEO backfill with Claude CLI, CodeGen

---

## Real problems to solve (data-driven)

Not "what does ElevenReader have that we don't" — instead, "what's actually broken in our funnel?"

| Problem | Evidence | Cost to fix |
|---|---|---|
| **No conversion tracking** | 0 Key Events in GA4 — can't measure anything | Low (done this session) |
| **No SEO traction** | ~15 organic/week despite SSG pipeline, DR 2.7 | Medium (content + linking) |
| **Mobile not shipped** | Expo build ready, not submitted to stores | Low (pure ops work) |
| **Landing unclear on value** | Copy mentions TTS first, pricing-curious visitors confused | Low (copy rewrite) |
| **No returning-user hook** | Returning guests see same hero as new visitors | Medium |
| **Vocab review friction** | Users save words but don't return to review | High (needs research) |

Nothing on this list mentions a Chrome extension or freemium tiers. Those are speculative — we'll revisit after we have baseline data.

---

## Phase 0: Measurement & quick wins (this week)

Goal: stop flying blind. Get baseline conversion data before making strategic bets.

### 0.1 Key Event tracking — **DONE this session**

Typed wrapper `apps/web/src/lib/analytics.ts`, wired to gtag setup in `index.html`. Events fire into measurement stream `G-3ZNR40KDFP`.

Events wired:
- `sign_up` — `AuthContext.tsx` (Google via `createdAt < 60s` heuristic, email register)
- `login` — `AuthContext.tsx` (Google returning, email login)
- `book_opened` — `ReaderPage.tsx` (library + userbook, once per mount)
- `reading_session_end` — `useReadingSession.ts` (duration, words, progress delta)
- `vocab_saved` — `useReaderVocabulary.ts` (both Path A authenticated and Path B anonymous pending)
- `book_uploaded` — `userBooks.ts` (format + size)
- `exit_intent_shown` / `exit_intent_converted` / `exit_intent_dismissed` — `ExitIntentModal.tsx`

Still pending (next PR):
- `translation_used` — `useTextTranslation.ts`
- `tts_played` — `useTts.ts`
- `search_performed` — `SearchPage.tsx`

### 0.2 Exit-intent lightbox — **DONE this session**

`ExitIntentModal.tsx` + CSS + i18n (en/uk). Shows to non-authenticated visitors on first of: mouseleave from top, scroll 70%, 45s dwell. Reader routes suppressed. SessionStorage-gated. Primary CTA opens AuthModal. Full A/B-ready via `variant` param.

**Variant currently shipping**: `dont-lose-place-v1`
Copy: "Don't lose your place — save your reading progress, vocabulary, and bookmarks — free forever."
Benefits: instant translation, SRS, offline + sync

### 0.3 Search Console → GA4 linked — **DONE earlier**

Organic query report will show in GA4 in 24–48h.

### 0.4 GA4 admin config — **manual, ~15 min**

In GA4 → Admin → Events, mark as Key Events:
- `sign_up`, `login`, `book_uploaded`, `vocab_saved`, `reading_session_end` (with `minutes >= 5` filter), `exit_intent_converted`

Create audiences:
- "Engaged guests" — fired `book_opened` + `vocab_saved` but no `sign_up`
- "Power readers" — ≥3 `reading_session_end` in 7 days

### Exit criteria

- 2 weeks of baseline conversion data in GA4
- Know: guest → sign-up %, sign-up → 1st reading session %, 1st → 3rd session %, vocab save → review rate
- Search Console data visible in GA4

Without this baseline, every phase below is a guess.

---

## Phase 1: Reading-first landing (1–2 weeks)

Goal: fix the positioning inconsistency. Copy and hierarchy should all say "reading" first.

### 1.1 Hero rewrite

Current hero (`HeroSection.tsx`) is already mostly reading-first ("Read books in English without stopping. Tap any word to translate to [lang]"). Keep it — do not demote to TTS messaging like ElevenReader.

**Audit pass**:
- Remove any homepage copy that leads with listening / voices / audiobooks
- `FeaturesSection.tsx` currently has 6 features with emoji including TTS — this file is unused now but the pattern appears in translations. Verify `en.json` / `uk.json` feature descriptions emphasize reading before audio.
- `brandLine`: "TextStack Reader — learn English by reading real books" ✓ keep

### 1.2 Comparison table — keep as is

`ComparisonSection.tsx` compares against LingQ / Kindle / Speechify. That's correct — these are our real reading competitors. Do *not* add ElevenReader to this table.

### 1.3 FAQ — already exists

`FAQSection.tsx` + `home.faq.*` translations. Audit for TTS-heavy phrasing. Ensure "is it free" is the first answer and sets expectation: **free forever** (we haven't decided on paid tier yet).

### 1.4 Testimonials — keep, refresh quarterly

5 existing testimonials in `en.json`. Replace placeholder names with real users as they opt in. Use opt-in flow in ProfileModal or a dedicated page after Phase 0 surfaces power readers.

### 1.5 Social proof

We don't have 66,000 listeners like ElevenReader. Honesty wins — don't fake numbers.

Realistic signals to add when available:
- Book count: "146 classics, free to read" ✓ (exists)
- Languages supported: "translate to 18+ languages" ✓
- Fazier badge ✓
- Product Hunt launch — when mobile ships
- Real count after 500+ active users: "used by X readers in Y countries"

### Exit criteria

- Landing copy audit complete, no TTS-first phrasing anywhere above the fold
- Comparison table still scoped to reading competitors
- `exit_intent_converted` rate visible in GA4

---

## Phase 2: Ship mobile (1–2 weeks)

Goal: unblock the biggest strategic lever. Mobile is built (29 screens in Expo); the bottleneck is store submission, not development.

### 2.1 iOS submission

- `cd apps/mobile && npm run build:prod`
- App Store Connect listing (screenshots from dev device, privacy labels, ASO for "learn english books", "read books translate")
- TestFlight beta → 20 users → feedback loop
- `npm run submit:ios`

### 2.2 Android submission

- EAS production build
- Play Console listing
- Internal testing track → open testing → production

### 2.3 Cross-device signals

Already wired server-side: reading progress, highlights, vocab, user books all sync via `/me/*` endpoints.

Verify:
- Mobile reader calls `POST /me/reading/sessions` — same schema as web
- Vocab saved on mobile appears in web reader
- Downloaded books don't conflict with web IndexedDB cache

### 2.4 Store ASO

Target search terms (not ElevenReader's terms):
- "learn english reading books"
- "read books in english with translation"
- "vocabulary builder from reading"
- "free english ebook reader"

### Exit criteria

- Live on both stores
- Sign-up rate from mobile > web baseline
- Deep link `textstack://book/:slug` works from share intent

Monetization decision waits until we have ≥2 weeks of mobile retention data.

---

## Phase 3: Reading-adjacent growth features (2–4 weeks)

Only start after Phase 0 data arrives. Priority will shift based on real funnel bottlenecks.

### 3.1 URL article import — **high impact, reading-native**

This fits our product thesis (read any text, learn from it). Unlike Chrome extension, it doesn't require store distribution.

- New entity `UserArticle` (title, source_url, html, language, word_count)
- Reader route `/:lang/articles/:id/read` reusing `ReaderPage` with `mode="article"`
- Fetcher: `Mozilla/Readability` via Node worker, HTML sanitization
- API: `POST /me/articles { url }` → 202 + polling like userbook upload
- UI: "paste a URL" input on home + library

### 3.2 Vocab review friction fix

Phase 0 will tell us the save→review conversion rate. If low (< 30%), invest here before any new acquisition channel.

Hypotheses to test:
- Push notification "5 words waiting" (mobile only)
- Email daily summary for web users
- Widget-sized mini-review on home after login
- Reduce first-review delay from 1 day to 4 hours for new words

### 3.3 Public reading profile (opt-in)

- `/@username` pages with streak, books finished, favorite genres
- Shareable to Twitter/LinkedIn → organic acquisition
- SEO: some profiles will index for name searches

### 3.4 Referrals — only if viral coefficient hypothesis confirmed

Build after Phase 3.3 if we see organic sharing happening.

---

## Phase 4: Monetization decision (conditional, after 6–8 weeks of data)

Goal: decide whether to monetize, and if so how. **Not predetermined.**

### Inputs needed (from Phase 0–3)

- Weekly active users
- Retention curves (D1, D7, D30)
- Save→review conversion
- Average session count per user
- Server cost per active user (Ollama, TTS, storage)

### Possible outcomes

**A. Stay free forever** — if growth is strong and server costs are sustainable
- Optional tip jar / patron system
- Sponsored classic books (e.g. translation publisher sponsorship)

**B. Freemium** — if core loop is solid but server costs rise
- Free: full catalog, reader, basic vocab, 1 userbook upload
- Paid ($4.99/mo): unlimited uploads, advanced TTS voices, no daily vocab cap, priority support
- Critical: free tier must remain genuinely useful (LingQ's mistake is making free tier painful)

**C. Services layer** — if power users emerge
- B2B: schools and universities license seats
- API access for tutors / language coaches
- Book import as a paid concierge service

Do *not* build pricing page UI until outcome is chosen. Premature commitment locks messaging.

---

## Phase 5: Distribution experiments (deferred)

Moved to last because these require large investment and don't fix known funnel issues.

### 5.1 Chrome extension

- Reuse reader UI for article overlay
- Major engineering lift — full build pipeline, store submission, support burden
- Only justify if URL import (Phase 3.1) shows strong article-reading behavior

### 5.2 For Authors program

- Upload contract, revenue share, editorial review
- Requires legal + ops investment
- Defer until we have ≥10k DAU

### 5.3 Promo video

- 60s hero video on landing
- Defer until brand and positioning are stable

---

## Explicitly dropped

Items that were in the prior plan but don't fit reading-first positioning:

| Item | Reason |
|---|---|
| TTS voice preview UI with sample sentences | Supporting feature, not headline — skip ElevenReader parity |
| Sleep timer | Audiobook feature, not reading feature |
| TTS speed to 4.0x | Already at 2.0x, no evidence users want faster |
| Pricing page before product decision | Premature commitment |
| Fake social proof numbers | Integrity cost > conversion lift |
| Copying ElevenReader's hero wording | Wrong positioning entirely |

---

## Engineering hygiene (ongoing, not phased)

- Keep TypeScript strict mode passing on every PR
- Every new user-facing feature adds at least one `track()` call
- Every copy change gets EN + UK translation in same PR
- Before A/B testing, document the hypothesis and success metric in this file
- SSG rebuild gated on content changes, not code changes — verify `make rebuild-ssg` still works before landing UI PRs

---

## This session — shipped

- `apps/web/src/lib/analytics.ts` — typed wrapper, 12 event types
- `AuthContext.tsx` — sign_up + login events with method discrimination
- `useReadingSession.ts` — reading_session_end after submit
- `useReaderVocabulary.ts` — vocab_saved for both auth paths
- `userBooks.ts` — book_uploaded on successful XHR
- `ReaderPage.tsx` — book_opened once per mount
- `ExitIntentModal.tsx` + `exit-intent.css` — full lightbox with GA instrumentation
- `App.tsx` — mounted ExitIntentModal inside LanguageRoutes
- `en.json` + `uk.json` — `home.exitIntent.*` block
- `PLAN-elevenreader-parity.md` — this rewrite (drop ElevenReader-mirror framing)

Not shipped (for follow-up):
- `translation_used` / `tts_played` / `search_performed` events
- GA4 admin config (must be done in the GA UI)
- Reader-route AB variants for exit-intent copy
