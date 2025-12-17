# Admin Tool Architecture (Private) — Bilingual MVP + Migration Notes

Goal: build a **separate admin tool** for onlinelib so it **does not leak into the public web app** and is easy to secure on a self‑hosted server.

This version is updated to reflect:
- MVP is **bilingual from day 1** (English + Ukrainian, extendable)
- Every translated book has a **hard link to the English edition** (“source” edition)
- You are currently at the **migrations stage** (EF Core Code-First)

Stack:
- **Docker Compose**
- **ASP.NET Core API + Worker**
- **React Web (public reader)**
- **React Admin (private tool)**
- **PostgreSQL**
- Book files stored on host FS via bind mount

---

## 1) High-level decision

We will implement **a separate Admin Web App** (React) that talks to the same API, but is:
- deployed separately (separate container)
- **not linked from public UI**
- **not included in sitemap**
- reachable only through **private access controls** (best: VPN/Tailscale; acceptable MVP: reverse proxy IP allowlist + Basic Auth + app login)

Public web (`web`) stays SEO/content-first.
Admin web (`admin`) stays internal/content-ops.

---

## 2) Components

### Existing
- `api` (ASP.NET Core): public read endpoints + admin endpoints (protected)
- `worker` (ASP.NET Core Worker): ingestion pipeline, background parsing/indexing
- `db` (PostgreSQL)
- `storage` (host filesystem bind mount): original book files + derived assets

### New
- `admin` (React): private UI for uploading & managing content (including translations)

---

## 3) Network & exposure model (recommended)

**Best practice for self-hosting:**
1. Admin is **not exposed** to the public internet.
2. Admin is reachable only through:
   - **Tailscale/VPN**, or
   - reverse proxy with **IP allowlist** (home IP), plus
   - app-level login (JWT/cookie)

**Minimal viable security (if VPN not ready yet):**
- Reverse proxy route `/admin` protected by:
  - IP allowlist (if possible), and/or
  - Basic Auth
- Admin UI additionally requires login.
- API admin endpoints require auth.

---

## 4) Docker Compose layout

Add a new service `admin`:

- `admin` container serves built static files (e.g., via nginx) on internal network
- Reverse proxy routes:
  - `/` → `web`
  - `/api` → `api`
  - `/admin` → `admin` (protected at proxy)

**Important:** do **not** place `admin` behind the same public route space without access control.

---

## 5) Authentication & authorization (Admin)

### Recommended approach (simple + robust)
- Add an **Admin authentication** flow in `api`:
  - `POST /api/admin/auth/login` → returns JWT (short-lived) + refresh token (optional)
  - `POST /api/admin/auth/logout`
  - `GET /api/admin/auth/me`

- Use **roles**:
  - `Admin` (full access)
  - later: `Editor`, `Moderator`

### Storage (new DB tables)
- `admin_users` (email, password_hash, role, is_active, timestamps)
- optional: `admin_refresh_tokens`
- recommended: `admin_audit_log`

---

## 6) Bilingual MVP data model (core DB changes)

### Key principle
A “book” in the library is a **Work** (abstract work), and each language version is an **Edition**.
Chapters are attached to an Edition.

We also store a **hard link** from each translation to the English edition:
- Ukrainian edition → `source_edition_id` → English edition

This enables:
- UI “Read in English” link
- consistent SEO canonical strategy per language
- future “diff / sync” workflows if you ever add tooling

### Entities (recommended MVP schema)

#### `works`
Represents the canonical work regardless of language.
- `id` (uuid)
- `slug` (unique, global)  ← stable slug for the work family
- `created_at`

#### `editions`
One per language/version (EN, UK, RU later).
- `id` (uuid)
- `work_id` (fk → works.id)
- `language` (text or smallint enum: `en`, `uk`, ...)
- `slug` (unique per language OR unique global — pick one rule and stick to it)
- `title`
- `description`
- `authors_json` (or join table later)
- `status` (`Draft | Published | Hidden`)
- `published_at` (nullable)
- `source_edition_id` (nullable fk → editions.id)
  - **required for non-English editions** in MVP (uk must point to en)
- `created_at`, `updated_at`

**Constraints**
- unique: `(work_id, language)`  (one edition per language per work)
- `source_edition_id`:
  - `NULL` allowed only for English editions (or “original language”)
  - for Ukrainian: must reference an English edition of the same work

(Enforcing “same work” for `source_edition_id` can be done in code + validation; strict DB check is possible but more complex.)

#### `chapters`
- `id` (uuid)
- `edition_id` (fk → editions.id)
- `chapter_index` (int)  ← order
- `slug` (optional; unique per edition)
- `title`
- `html` (extracted chapter HTML)
- `plain_text` (for FTS)
- `created_at`, `updated_at`

#### `reading_progress` (user-facing)
Store progress **per edition** (language-specific), but you can also store “linked progress” later.
- `id`
- `user_id`
- `edition_id`
- `locator` (json/text)  ← kindle-like locator
- `updated_at`

#### `notes`, `bookmarks` (user-facing)
Also per edition, because chapters differ across languages.
- `edition_id`, `chapter_id`, etc.

---

## 7) Ingestion model (updated for bilingual)

### Two ingestion paths
1) **English ingestion (source)**
   - upload EN file
   - worker parses → creates Work + English Edition + Chapters

2) **Ukrainian ingestion (translation)**
   - upload UK file OR paste translation content
   - admin must select:
     - existing Work / English Edition to link to
   - worker parses → creates Ukrainian Edition + Chapters
   - sets `source_edition_id = <englishEditionId>`

### DB entity: `ingestion_jobs` (if not already present)
- `id`
- `uploaded_file_path`
- `target_language` (en/uk)
- `work_id` (nullable)
- `source_edition_id` (nullable; required for uk jobs)
- `status` (`Queued | Running | Failed | Completed`)
- `error`
- timestamps

---

## 8) Admin API surface (protected) — bilingual-aware

All endpoints below require `Admin` role.

### Upload & ingestion
- `POST /api/admin/books/upload`
  - multipart file upload
  - body: `targetLanguage`, and one of:
    - `createNewWork = true` (English only), OR
    - `workId` (attach to existing work), OR
    - `sourceEditionId` (required for Ukrainian in MVP)
  - saves file to storage
  - creates `IngestionJob`
  - returns job id

- `GET /api/admin/jobs?status=...`
- `GET /api/admin/jobs/{id}`
- `POST /api/admin/jobs/{id}/retry`

### Work & edition management
- `GET /api/admin/works?query=...`
- `POST /api/admin/works` (optional; usually created by EN ingestion)
- `GET /api/admin/works/{id}`
- `GET /api/admin/works/{id}/editions`

- `GET /api/admin/editions?query=...&language=...&status=...`
- `GET /api/admin/editions/{id}`
- `PUT /api/admin/editions/{id}`
  - title, description, authors, status, etc.
- `POST /api/admin/editions/{id}/publish`
- `POST /api/admin/editions/{id}/unpublish`

### Chapters / content QA
- `GET /api/admin/editions/{id}/chapters`
- `GET /api/admin/chapters/{chapterId}`
- `PUT /api/admin/chapters/{chapterId}` (optional for MVP)

---

## 9) Admin UI pages (MVP) — bilingual flow

### 1) Login

### 2) Upload English (New Work)
- Upload file (EN)
- Optional: title/author hint
- Creates: Work + EN Edition

### 3) Upload Ukrainian (Link to English)
- Select **English Edition** (search)
- Upload Ukrainian file
- Creates: Ukrainian Edition with `source_edition_id` pointing to English

### 4) Jobs
- monitor parsing/errors
- retry

### 5) Works / Editions
- Works list → open → see Editions (EN + UK)
- Quick links:
  - “View EN”
  - “View UK”
  - “Missing translation” indicator

### 6) Chapter preview
- per edition preview
- optional: side-by-side later (EN vs UK)

---

## 10) SEO implications (bilingual)

Public web should expose separate URLs:
- English: `/en/books/{workSlug}/{editionSlug?}/...` (or `/en/book/{editionSlug}`)
- Ukrainian: `/uk/books/...`

The “hard link” is used to:
- show “Read in English” button on Ukrainian pages
- set `hreflang` pairs (en ↔ uk) on both sides

Admin tool itself remains private and **not indexed**.

---

## 11) Migration plan (EF Core) — do this now

You said you’re at the migrations stage. This is the order that minimizes pain:

### Step A — Introduce new core tables
1. Add entity + migration:
   - `works`
   - `editions`
   - `chapters` now pointing to `edition_id` (not `book_id`)

2. If you already had `books`:
   - either rename to `editions` (cleanest), or
   - keep `books` but make it represent `editions` and add `works` + `work_id`
   - **avoid “book = work” ambiguity** from day 1

### Step B — Add bilingual linkage
3. Add `editions.source_edition_id` (nullable FK → editions.id)
4. Add unique constraint `(work_id, language)`

### Step C — Update ingestion tables
5. Add/extend `ingestion_jobs` with:
   - `target_language`
   - `work_id` nullable
   - `source_edition_id` nullable (required for uk jobs)

### Step D — Update user-facing entities (if already created)
6. Update `reading_progress`, `notes`, `bookmarks` to reference `edition_id` (and `chapter_id` as needed)

### Step E — Seed admin user (optional)
7. Seed one admin user from env vars or a CLI command:
   - email + password hash
   - role Admin

---

## 12) Operational concerns

### Audit log (recommended early)
Table: `admin_audit_log`
- `admin_user_id`
- `action_type`
- `entity_type`, `entity_id`
- `payload_json`
- `created_at`

### Backups
- PostgreSQL backups
- storage directory backups

### Upload hardening
- size limits
- extension/mime validation
- store originals; never serve originals publicly

---

## 13) Implementation plan (step-by-step)

1) Implement DB changes (Works/ Editions/ Chapters + bilingual linkage)
2) Update worker ingestion pipeline for:
   - EN: create Work + EN Edition
   - UK: require sourceEditionId → create UK Edition + Chapters
3) Add Admin auth tables + endpoints
4) Build Admin UI:
   - Upload EN (new work)
   - Upload UK (link to EN)
   - Jobs monitor
   - Editions editor (title/description/status)
5) Add audit log + basic hardening

---

## 14) Non-goals for MVP (keep it simple)

- No advanced WYSIWYG editor
- No paragraph-level translation diff
- No multi-role permission matrix
- No complex approvals

