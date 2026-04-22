# TextStack — 8-Week Pre-Sale Plan

**Start**: 2026-04-22 · **Target**: 2026-06-17 · **Mode**: polish-for-sale + OSS visibility

## North Star (from dev.to marketing launch)

Article: <https://dev.to/mrviduus/i-quit-designing-data-intensive-applications-ddia-three-times-heres-what-i-build-on-the-fourth-5bom>

**Positioning**: A friction-free reader for developers learning AI engineering.
Not a dictionary lookup — contextual Claude-powered explanations tied to the
book's domain. Capped weekly SRS queue (not infinite). Modern replacement for
Kindle Word Wise / LingQ.

**Target user**: developers stuck on AI engineering books (DDIA, ML papers,
AI textbooks — 15–20 curated corpus).

**CTAs in article**: star the repo · try sample chapters · send feedback
(Twitter @Rexetdeus, email).

**6-month goal (public)**: one paying customer.

**Anything we build must serve**: (a) sale diligence, OR (b) GitHub star
conversion, OR (c) Play Store launch. Nothing else.

---

## Constraints

| Constraint | Value |
|---|---|
| Timeline | 8 weeks hard (2026-04-22 → 2026-06-17) |
| Scope | Full — keep Reader/Vocab/TTS/Mobile/Admin/SEO |
| Books corpus | **Keep** — 1500+ Standard Ebooks (SEO must not regress) |
| Mobile | Android **must** publish on Play Store; iOS optional |
| Buyer | Open market (MicroAcquire / Acquire.com / Flippa) |
| Parallel | Marketing running — repo public, stars matter |

---

## Weekly tracks

### Week 1–2 · Repo polish + legal foundation  *(current, in progress)*

Goal: repo looks like a top product on first GitHub visit; legal ambiguity
killed.

- [x] Healthchecks — worker/ssg-worker/admin (#137)
- [x] Stale Blog/Reading Rooms refs cleanup (#138)
- [x] Docs: uptime runbook + backup rewrite (#139)
- [x] Incident runbook — 8 outage scenarios (#140)
- [x] Bus-factor READMEs — infra/scripts + infra/systemd (#141)
- [ ] **README full rewrite** — hero, screenshots, demo gif, 5-line
      quick-start, features table aligned with dev.to narrative (AI
      engineering books, contextual explanations, capped SRS). Critical for
      star conversion.
- [ ] **LICENSE file** — pick MIT or Apache-2.0 (recommend MIT for max star
      potential + commercial reuse by buyer). Add to root.
- [ ] **COPYRIGHT.md / NOTICE** — break down: our code (MIT), Standard
      Ebooks corpus (public domain, CC0), OSS deps (inherited), Edge TTS
      (Microsoft ToS). Sale-critical clarity.
- [ ] **CONTRIBUTING.md** — how to dev, PR conventions, test expectations
- [ ] **`.github/ISSUE_TEMPLATE/`** — bug / feature / question
- [ ] **`.github/PULL_REQUEST_TEMPLATE.md`**
- [ ] Repo topics on GitHub (reading, spaced-repetition, ai-engineering,
      dotnet, react, expo, epub, pdf) — helps discovery
- [ ] GitHub Discussions enabled
- [ ] Demo link in repo About + pinned in README hero

Acceptance: new visitor lands on repo, in < 30s knows what it is, sees
demo, clicks star. License is unambiguous to a buyer's lawyer.

### Week 3–4 · Mobile Android → Play Store

Goal: Android app approved + live on Play Store before buyer diligence.
(Play review = 2–4 weeks, so kick off asap in week 3.)

- [ ] Audit mobile app for crashes / broken flows (Expo + dev build smoke)
- [ ] EAS production build (Android) — `npm run build:prod`
- [ ] App icon + feature graphic + 8 screenshots (phone + tablet)
- [ ] Play Store listing: title, short/full description, category, content
      rating, target audience, data-safety form
- [ ] Privacy policy URL (reuse textstack.app/privacy) + terms URL
- [ ] Internal testing track → closed testing (10+ testers from network) →
      production rollout
- [ ] iOS: EAS build + TestFlight (best-effort; ship if time allows)
- [ ] Deep-links from web → mobile app (book page → app if installed)

Acceptance: Android app live on Play Store, findable by search
"TextStack" or "reading vocabulary SRS".

### Week 5–6 · SEO defense + marketing infra

Goal: SSG traffic doesn't regress under polish; repo stars compound via
marketing; buyer sees "healthy growth" graphs.

- [ ] **Search Console integration** — verify property, submit sitemap,
      enable Indexing API via service account (advanced, but signals pro)
- [ ] **Coverage alerting** — small script/GHA that fetches Search Console
      indexing stats daily, alerts if > 5% regression
- [ ] Structured data validation in CI — fail PR if book/author/blog JSON-LD
      breaks
- [ ] **Demo landing** for non-developers — static HTML with "try it"
      flow, featured on textstack.app home (if not already)
- [ ] `public/assets/og-image.png` for link previews (Twitter/LinkedIn
      share looks polished)
- [ ] Content pipeline for blog-less world: write 3 technical blog posts
      on dev.to to drive repo stars (one per SRS/TTS/SSG). (Marketing
      dep — user owns this, not code.)
- [ ] "How TextStack Works" architecture 1-pager (SVG or PNG) in README
- [ ] GitHub Actions badge(s) in README (CI, coverage, license)

Acceptance: Search Console property verified, sitemap submitted, indexing
stable. Repo has shareable OG card. Architecture diagram visible.

### Week 7–8 · Diligence package

Goal: buyer asks "show me the numbers/health" → you hand over one link.

- [ ] Metrics snapshot page (admin-only or separate Notion/sheet):
      DAU, WAU, retention D1/D7/D30, books read total, vocab words saved,
      uptime % last 90d
- [ ] ERD auto-generated from EF Core → `docs/02-system/erd.svg`
- [ ] Test coverage report (backend + web) published via GHA artifact
- [ ] `npm audit --production` clean (or documented known CVEs)
- [ ] `dotnet list package --vulnerable` clean
- [ ] **DB restore verification script** — `infra/scripts/verify-backup.sh`
      + `make verify-backup` target; run quarterly + document last-run date
- [ ] "Buyer setup" section in README — "clone → env → docker compose up
      → < 1h running locally" benchmarked on a clean laptop
- [ ] Financials prep (outside code): hosting costs, Claude API spend,
      domain/cert costs, per-user unit economics (user owns this)
- [ ] LOI-ready: repo archived state snapshot tag `v1.0-sale-ready`

Acceptance: diligence checklist ticks all green; buyer can inspect
code, metrics, legal, ops without asking questions for 48 hours.

---

## PR log

| # | Title | Status |
|---|-------|--------|
| #137 | Healthchecks worker/ssg/admin | ✅ merged |
| #138 | Stale Blog/Reading Rooms refs | ✅ merged |
| #139 | Uptime runbook + backup fix | ✅ merged |
| #140 | Incident runbook | ✅ merged |
| #141 | Infra scripts/systemd READMEs | 🟡 auto-merge armed |
| next | README rewrite | pending |

---

## Marketing signals inbox  *(user updates this)*

Add raw notes from dev.to / Twitter / HN / Reddit reactions. We adjust the
plan when signals arrive.

- 2026-04-22 · dev.to article published. Angle: "I quit DDIA 3 times…"
  CTA: star + try + feedback. Need: README narrative must match this
  before traffic arrives, or conversion drops.

---

## Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-04-22 | Keep Standard Ebooks corpus in sale | SEO SSG pages = indexed inventory; removing = traffic hit |
| 2026-04-22 | Mobile Android in sale, iOS best-effort | Play review ≤ Apple review; Android gets done, iOS gated on time |
| 2026-04-22 | MIT license (tentative) | Max star potential, max commercial reuse by buyer |
| 2026-04-22 | Full scope, not trimmed | 8w is enough time; Full = higher ask |

---

## Known risks

1. **Play Store rejection loop** — Android apps get denied for data-safety
   form mistakes. Mitigation: start week 3, internal testing first.
2. **SEO regression** — any change to SSG pipeline can drop indexing. Have
   Search Console property verified before any risky changes.
3. **Claude API costs under viral traffic** — if dev.to article hits HN
   front page, explanation endpoint may burn budget. Consider per-IP
   rate limit on `/explain` + sample-chapter-only gating.
4. **License ambiguity blocks sale** — must be resolved week 1. No buyer
   signs without clear IP position.
5. **Standard Ebooks derivatives IP claim** — our covers/SSG pages are
   derivatives. Low risk (CC0 base) but prompt a lawyer if buyer asks.

---

## Running punch list  *(discovered mid-flight — triage into a week)*

- [ ] `.github/workflows/health-check.yml` — confirm it still runs every
      5min and that the email on failure works
- [ ] README has screenshots folder `docs/assets/` — reuse / extend for
      hero, feature shots, mobile screenshots
