# Metrics Snapshot

Point-in-time numbers from prod DB for diligence. Regenerate with
queries in `infra/scripts/metrics.sql` against `textstack_db_prod`.

**Snapshot date**: 2026-04-22
**Product status**: pre-launch / soft-launch (family + friends). Public
site live, marketing not yet started.

## Users

| Metric | Value |
|--------|-------|
| Registered (non-guest) | 4 |
| Guests (anonymous sessions) | 17 |
| Auth split (registered) | 3 Google · 1 email · 0 Apple |
| Growth | +3 Jan 2026, +1 Mar 2026 |

Guests auto-purged after 6h inactivity by `GuestCleanupWorker` — total
guest traffic is higher than the snapshot number. For acquisition
signal track `reading_sessions` distinct users, not `users` count.

## Engagement (reading)

| Window | Active readers | Sessions | Hours |
|--------|---------------|----------|-------|
| Last 24h | 5 | — | — |
| Last 7d | 11 | — | — |
| Last 30d | 13 | — | — |
| All-time | 13 readers | 326 sessions | 25.8 h |

- Avg session length: **4.7 min** (short — commuter / pre-bed reading)
- Total words read all-time: **7,982**
- Daily session volume last 30d: 1–22 sessions/day, peaked
  2026-04-15 (22 sessions, 1.1 h), 2026-04-21 (20 sessions, 0.9 h)

## Content (library)

| Asset | Count |
|-------|-------|
| Works (canonical titles) | 1,416 |
| Editions — Published | 208 |
| Editions — Draft | 1,208 |
| Chapters (parsed) | 40,333 |
| Authors | 703 |

Draft backlog feeds the Auto-Publish pipeline (SEO generation →
publish). Published = visible on public site; Draft = ingested but
unindexed.

## User-uploaded books

| Metric | Value |
|--------|-------|
| Total user books | 24 |
| Unique uploaders | 2 |
| Uploaded last 30d | 14 |

Parallel to the admin catalog — each user has private library. Drives
storage growth (see `./data/storage`).

## Vocabulary (SRS)

| Metric | Value |
|--------|-------|
| Words saved (all-time) | 12 |
| Unique learners | 4 |
| Stage 0 (New) | 12 |
| Reviews completed last 30d | 0 |

Feature shipped; zero-review signal means users save words but haven't
returned to the review flow. Known friction: review session entry is
buried under /vocabulary tab. Acquisition gating, not product bug.

## Annotations

| Type | Count |
|------|-------|
| Highlights | 4 |
| Bookmarks | 0 |
| Notes | 0 |

## Retention (weekly cohorts)

| Cohort | Size | W1 return | W2 | W4 |
|--------|------|-----------|----|----|
| 2026-03-23 | 1 | 1 | 1 | 0 |
| 2026-01-12 | 1 | 0 | 0 | 0 |
| 2026-01-05 | 2 | 0 | 0 | 0 |

Sample size too small for meaningful retention curve. Rerun after
public launch + first 100 registrations.

## What these numbers mean for a buyer

- **Content moat is real**: 40k chapters + 1.4k editions + 700 authors
  is a non-trivial corpus ready to ship. Draft backlog (1,208) is an
  asset — automated SEO publishing pipeline already built.
- **User base is pre-revenue**: registered count is family + friends.
  No marketing spend; numbers reflect engineering signal, not PMF.
- **Engine is warm**: 326 reading sessions on 13 distinct readers
  proves the reader, SRS, session tracking, achievements all work
  end-to-end in prod.
- **Unit economics unknown**: no paywall, no monetisation experiment
  run yet.

## How to regenerate

```bash
ssh asus
docker exec textstack_db_prod psql -U textstack_prod textstack_prod \
  -f /path/to/metrics.sql
```

Queries live at [infra/scripts/metrics.sql](../../infra/scripts/metrics.sql).
