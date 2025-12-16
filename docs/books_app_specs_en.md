# Specs Doc: Free Book Library (SEO) + Kindle-like Reader
Backend: ASP.NET Core + PostgreSQL | Frontend: React / React Native  
Date: 2025-12-16 • Version: v0.1 (MVP+)

---

## 1) Goals and Core Principles

**Goal:** Provide a Kindle-like reading experience (continue reading on any device from the last position) while extracting text and structure from uploaded book files (EPUB/PDF/FB2/…) to publish SEO-indexable pages.

**Core principles:**
- **Stable reading position identifier (Locator)** shared between client and server.
- **Offline-first:** reading and note-taking must work without network connectivity.
- **Explicit conflict resolution rules** to avoid losing progress or annotations.
- Heavy operations (parsing/ingestion) run in a **background worker**, not in the API.
- Secure authentication with minimal but clear session handling.

---

## 2) Domain Model

### 2.1 Books and Content
- **Book** – book metadata and SEO identity (slug).
- **BookAsset** – original uploaded files (epub/pdf/fb2/etc.).
- **BookChapter** – logical structure of a book (chapters/sections).
- **ChapterContent** – extracted text/HTML used for SEO and search.
- **IngestionJob** – background job tracking parsing/import status.

### 2.2 User Reading Data
- **UserLibrary** – user’s personal library.
- **ReadingProgress** – current reading position per book.
- **Note / Highlight / Bookmark** – user annotations bound to a locator.
- **Device** – client device identity (useful for sync and diagnostics).
- **SyncOperation** – optional operation log for advanced offline sync.

---

## 3) Database Design (PostgreSQL)

> Use `uuid` as primary keys and `timestamptz` for timestamps.  
> Notes, highlights, and bookmarks use **soft delete** (`IsDeleted`).

---

### 3.1 Content Tables

#### `Books`
- `Id (uuid, PK)`
- `Title`
- `Author`
- `Language`
- `Description`
- `CoverUrl`
- `Slug (unique)`
- `Visibility` (public/private)
- `CreatedAt`

#### `BookAssets`
- `Id (uuid, PK)`
- `BookId (FK -> Books.Id)`
- `OriginalFileName`
- `Format` (epub/pdf/fb2/…)
- `StoragePath`
- `FileHash` (sha256)
- `SizeBytes`
- `CreatedAt`

**Constraints / indexes:**
- `UNIQUE(FileHash)` or `UNIQUE(BookId, FileHash)` depending on deduplication policy.

---

#### `BookChapters`
- `Id (uuid, PK)`
- `BookId (FK)`
- `OrderIndex (int)`
- `Title`
- `Slug`
- `WordCount`
- `CreatedAt`

**Constraints:**
- `UNIQUE(BookId, OrderIndex)`
- `UNIQUE(BookId, Slug)`

---

#### `ChapterContent`
- `ChapterId (uuid, PK, FK -> BookChapters.Id)`
- `ContentHtml`
- `ContentText`
- `UpdatedAt`

**Search (MVP):**
- PostgreSQL Full-Text Search using `tsvector` on `ContentText`.

---

#### `BookIngestionJobs`
- `Id (uuid, PK)`
- `BookId (FK)`
- `Status` (Queued / Processing / Done / Failed)
- `Error`
- `CreatedAt`
- `UpdatedAt`

---

### 3.2 Users and Reading State

#### `Users`
- `Id (uuid, PK)`
- `Email (unique)`
- `PasswordHash`
- `DisplayName`
- `Status`
- `CreatedAt`
- `LastLoginAt`

---

#### `Devices`
- `Id (uuid, PK)`
- `UserId (FK)`
- `DeviceType` (ios / android / web)
- `PushToken` (nullable)
- `CreatedAt`
- `LastSeenAt`

---

#### `UserLibrary`
- `UserId (FK)`
- `BookId (FK)`
- `AddedAt`
- `Status` (reading / finished)
- `LastOpenedAt`
- **Primary Key:** `(UserId, BookId)`

---

#### `ReadingProgress`
- `UserId`
- `BookId`
- `Locator` (string, later can be `jsonb`)
- `ProgressPercent` (decimal, nullable)
- `UpdatedAt`
- `DeviceId` (nullable)
- `Version (int)`
- **Primary Key:** `(UserId, BookId)`

---

#### `Notes`
- `Id (uuid, PK)` – generated client-side (offline-friendly)
- `UserId`
- `BookId`
- `Locator`
- `Text`
- `CreatedAt`
- `UpdatedAt`
- `IsDeleted`
- `Version`

Indexes: `(UserId, BookId)`, `(UpdatedAt)`

---

#### `Highlights`
- `Id (uuid, PK)`
- `UserId`
- `BookId`
- `LocatorStart`
- `LocatorEnd`
- `Color`
- `CreatedAt`
- `UpdatedAt`
- `IsDeleted`
- `Version`

---

#### `Bookmarks`
- `Id (uuid, PK)`
- `UserId`
- `BookId`
- `Locator`
- `Label`
- `CreatedAt`
- `UpdatedAt`
- `IsDeleted`
- `Version`

---

#### `SyncOperations` (optional, advanced offline sync)
- `Id (uuid, PK)`
- `UserId`
- `DeviceId`
- `EntityType` (Progress / Note / Highlight / Bookmark)
- `EntityId`
- `Operation` (Upsert / Delete)
- `Version`
- `ClientTimestamp`
- `ServerTimestamp`

---

## 4) Locator: Representing Reading Position

The **Locator** is a stable string representation of where the user is in a book.

### 4.1 Recommended Unified Format
Stored as a JSON string:

```json
{"type":"text","chapterId":"<uuid>","para":87,"char":120}
```

Examples:
- PDF:
```json
{"type":"pdf","chapterId":"<uuid>","page":123,"offset":456}
```

- EPUB:
```json
{"type":"epub","chapterId":"<uuid>","cfi":"epubcfi(/6/2[chapter]!/4/2/14)"}
```

---

### 4.2 MVP Simplification
Since all books are parsed into `ChapterContent`, the MVP reader can rely on:
- `chapterId` + character/paragraph offset within extracted text.
- Server stores only the **latest valid locator** per book and user.

---

## 5) Offline Mode and Synchronization

### 5.1 Required Scenarios
1. User reads online, then continues offline.
2. Progress and notes sync when connectivity returns.
3. Reading on multiple devices does not lose progress.
4. Offline deletions do not reappear after sync.

---

## 6) Sync Strategies

### Level A – MVP: Last-Write-Wins + Versioning
- Each mutable entity has a `Version` integer.
- Client sends updates with the last known version.
- Version mismatch → server returns `409 Conflict` with current state.
- Client updates local data or applies a simple resolution rule.

**Pros:** very fast to implement  
**Cons:** limited conflict handling for long offline periods

---

### Level B – Offline-First: Operation Log
- Client records offline operations (`Upsert` / `Delete`) locally.
- On reconnect, client sends a batch to `/sync/batch`.
- Server applies operations sequentially per device and increments versions.
- Conflicts return current server state for resolution.

---

## 7) Conflict Resolution Rules

### 7.1 Reading Progress
- Default rule: **latest server `UpdatedAt` wins**.
- UX recommendation:
  - Show “Continue Reading” (latest position)
  - Optionally show “Last position on another device”

Avoid using “max progress percent” as it breaks non-linear reading.

---

### 7.2 Notes, Highlights, Bookmarks
- IDs generated client-side enable offline creation.
- Deletions use soft delete (`IsDeleted=true`).
- Concurrent edits → `409 Conflict`; UI can ask user to choose or merge.

---

## 8) Sessions and Authentication

### 8.1 Meaning of Session End
A session equals:
- Short-lived **access token**
- Long-lived **refresh token**

Loss of connectivity must **not** end the reading session.

---

### 8.2 Token Strategy
- Access token (JWT): 10–20 minutes
- Refresh token: 30–90 days
- Refresh tokens stored server-side as hashes and bound to `DeviceId`.

---

### 8.3 Offline + Expired Tokens
- Offline: queue changes locally, do not block UI.
- Online + expired access token: refresh and continue syncing.
- Expired/revoked refresh token: require login, but keep local offline data.

---

## 9) Book Ingestion Pipeline (SEO)

### 9.1 Flow
1. **Upload:** API saves file → creates `Book`, `BookAsset`, `IngestionJob(Queued)`.
2. **Worker:** detects format → extracts metadata → builds chapters → extracts text/HTML.
3. **Persist:** writes `BookChapters` and `ChapterContent`, updates `Books`, marks job Done/Failed.
4. **Publish:** pages available at:
   - `/books/{slug}`
   - `/books/{slug}/{chapterSlug}`
   - sitemap.xml updated.

---

### 9.2 Deduplication
- `FileHash (sha256)` used to detect duplicates.
- Policy options:
  - Strict: reject identical uploads.
  - Loose: reuse storage but allow multiple book records.

---

## 10) MVP Features and Acceptance Criteria

### 10.1 MVP Features
- Authentication (register / login / refresh)
- Book catalog and basic search
- Book page with chapter list (SEO)
- Chapter reader with “Continue Reading”
- Reading progress sync
- Notes and bookmarks sync
- Admin upload + ingestion status

---

### 10.2 Acceptance Criteria
- Two devices: reading on device A continues at the same position on device B.
- Offline notes/deletions sync correctly when back online.
- Conflicting edits produce a clear conflict resolution flow.
- SEO pages are accessible as server-rendered HTML and included in sitemap.

---

## 11) Risks and Constraints
- **Copyright:** public-domain or licensed content strategy required before public launch.
- PDF parsing is harder than EPUB/FB2; start with 1–2 formats.
- SPA + SEO: SSR or prerendering recommended later.
- Local volume storage is fine for dev; production requires object storage (S3/Blob).

---
