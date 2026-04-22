# Data Model Overview

One-page map of Postgres entities. For exact columns + types read
`backend/src/Domain/Entities/` — C# records are the source of truth.
For schema evolution read `backend/src/Infrastructure/Migrations/`
(~86 migrations, chronological).

## Grouped by domain

### 1. Catalog (admin-curated library)

Canonical books and their metadata. Admins create/edit; SSG prerenders pages
for SEO.

- `Work` — canonical title (just slug)
- `Edition` — per-language version of a Work. Title, description, cover, SEO fields
- `Chapter` — rendered HTML + plain text + FTS vector
- `Author`, `EditionAuthor` — many-to-many
- `Genre` — Edition → Genre (FK)
- `BookFile`, `BookAsset` — raw uploaded originals + derived covers
- `IngestionJob` — async pipeline (upload → parse → chapters)
- `AutoPublishJob`, `BookQualityJob`, `LintResult` — quality/autopublish pipelines

### 2. SEO + search

Supporting the discovery layer.

- `SsgRebuildJob`, `SsgRebuildResult` — Puppeteer prerender queue
- `SeoTemplate`, `SeoBackfillJob`, `SeoBackfillSettings` — admin SEO automation
- `TextStackImport` — bulk import pipeline

### 3. Users + auth

End-users and their authentication primitives.

- **`User` — PII** (email, optional name, OAuth subject IDs)
- `UserRefreshToken` — session cookies
- `PasswordResetToken` — short-lived email reset
- **`AdminUser` — PII** (email only)
- `AdminRefreshToken`, `AdminSettings`

### 4. User-uploaded books (parallel to catalog)

Separate from admin catalog — each user has their own library.

- `UserBook` → `UserChapter`
- `UserBookFile` — original upload (may hold filename; not PII)
- `UserIngestionJob` — per-user async parse
- `UserBookBookmark`
- `UserLibrary` — User ↔ Edition favorites

### 5. Reading engagement

What users do while reading. Drives stats, achievements, offline sync.

- `ReadingProgress` — per-book position
- `ReadingSession` — time-boxed session (30s heartbeat, duration, words read)
- `ReadingGoal` — daily_minutes / books_per_year target
- `UserAchievement` — 20 achievements (milestones/streaks)
- `Bookmark`, `Highlight`, `Note` — annotations
- `UserVocabularySettings`

### 6. Vocabulary SRS

Spaced-repetition language learning layer.

- `VocabularyWord` — saved word + LLM-generated distractors/hint/explanation + SRS state (stage, interval)
- `VocabularyReview` — each answer event (correct, time, mode)
- `PendingVocabularyWord` — queue before LLM enrichment
- `WordFrequency`, `WordCluster`, `WordLookup` — dictionary support

### 7. Multisite (legacy — single-site now, ADR-007)

- `Site`, `SiteDomain` — preserved for future; host-based resolution still
  routes through `SiteContextMiddleware`

## Ownership graph (high-level)

```
Site ─┬─ Work ── Edition ─┬─ Chapter
      │                    ├─ EditionAuthor ─ Author
      │                    └─ Genre
      │
      ├─ User ─┬─ UserRefreshToken
      │       ├─ UserLibrary ─ Edition (favorites)
      │       ├─ ReadingProgress, ReadingSession, ReadingGoal, UserAchievement
      │       ├─ Bookmark, Highlight, Note            (on Chapter)
      │       ├─ VocabularyWord → VocabularyReview
      │       └─ UserBook ─┬─ UserChapter
      │                    ├─ UserBookFile
      │                    ├─ UserBookBookmark
      │                    └─ UserIngestionJob
      │
      └─ AdminUser ─ AdminRefreshToken
```

## PII / GDPR map

Tables that hold personal data, for data-flow / subject-access-request
planning.

| Table | Fields | Notes |
|-------|--------|-------|
| `User` | email, name?, google_subject?, apple_subject?, last_active_at | Primary PII |
| `AdminUser` | email | Internal staff accounts |
| `UserRefreshToken` | user_id + cookie hash | Session binding |
| `AdminRefreshToken` | admin_user_id + cookie hash | Session binding |
| `PasswordResetToken` | user_id + short-lived token hash | Auto-expires |
| `ReadingSession`, `ReadingProgress`, `ReadingGoal`, `UserAchievement` | user_id FK | Activity, behavioural |
| `VocabularyWord`, `VocabularyReview`, `UserVocabularySettings` | user_id FK | Learning patterns |
| `Bookmark`, `Highlight`, `Note` | user_id FK | Reading annotations |
| `UserBook`, `UserChapter`, `UserBookFile`, `UserBookBookmark`, `UserLibrary`, `UserIngestionJob` | user_id FK | User-uploaded content + library |

**Guest users**: `User` rows with `is_guest = true`, purged by
`GuestCleanupWorker` after 6h inactivity (cascade deletes all `user_id`-FK
tables above).

**Account deletion**: currently manual (admin panel). FK cascades handle
child rows via EF Core conventions — verify a test restore before a real
delete.

## Migrations

- Count: ~86, all additive or backwards-compatible.
- Tool: `dotnet ef migrations add <Name> --project backend/src/Infrastructure --startup-project backend/src/Api`
- Rollback all: `MIGRATE_TARGET=0 docker compose up migrator`
- Migrator runs as one-shot container in prod compose; `api` waits on
  `service_completed_successfully`.

## See also

- [CLAUDE.md](../../CLAUDE.md#key-concepts) — entity descriptions + workflows
- [backend/src/Domain/Entities/](../../backend/src/Domain/Entities/) — C# records
- [docs/01-architecture/multisite.md](multisite.md) — site resolution (ADR-007)
- [docs/03-ops/backup.md](../03-ops/backup.md) — backup + restore drill
