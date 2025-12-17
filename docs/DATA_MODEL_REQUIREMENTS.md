# OnlineLib – Data Model Requirements

This document defines the **authoritative data model requirements** for OnlineLib MVP.
It is a requirements/spec file (not implementation notes).

---

## 1. Storage Strategy (Hard Requirement)

### Disk (host filesystem)
Store on disk (bind-mounted into Docker):
- [ ] Original book files (`.epub`, `.pdf`, `.fb2`)
- [ ] Optional derived assets (covers, cached HTML files) — optional

Rules:
- [ ] Disk path is **not publicly accessible**
- [ ] Original files are **never served publicly**
- [ ] File paths in DB are **relative** to the configured storage root

### PostgreSQL
Store in Postgres:
- [ ] Book metadata
- [ ] Chapter structure and content (HTML + text)
- [ ] Ingestion job state
- [ ] Search vectors / indexes
- [ ] User features: progress, library, notes, bookmarks

---

## 2. Naming & IDs

- [ ] Use stable primary keys (UUID recommended; int acceptable)
- [ ] Public URLs use **slugs** (stable, unique per book; unique per chapter within a book)
- [ ] Slugs must be deterministic and collision-safe (append short suffix if needed)

---

## 3. Entities (Minimum Required)

### 3.1 Book
Required fields:
- [ ] `Id`
- [ ] `Slug` (unique)
- [ ] `Title`
- [ ] `AuthorDisplay` (MVP: string)
- [ ] `Language` (optional but recommended)
- [ ] `Description` (optional)
- [ ] `Status` (Draft | Processing | Published | Failed)
- [ ] `CreatedAt`, `UpdatedAt`

Indexes / constraints:
- [ ] Unique index on `Slug`
- [ ] `Status` indexed (optional)

---

### 3.2 BookFile
Required fields:
- [ ] `Id`
- [ ] `BookId` (FK → Book)
- [ ] `Format` (Epub | Pdf | Fb2 | Other)
- [ ] `OriginalFileName`
- [ ] `StoragePath` (relative path)
- [ ] `Sha256` (or other hash)
- [ ] `FileSizeBytes`
- [ ] `CreatedAt`

Constraints:
- [ ] FK `BookId` required
- [ ] Unique index on `Sha256` (optional but recommended for dedupe)

---

### 3.3 Chapter
Required fields:
- [ ] `Id`
- [ ] `BookId` (FK → Book)
- [ ] `Order` (int)
- [ ] `Slug` (unique within book)
- [ ] `Title` (optional)
- [ ] `Html` (sanitized)
- [ ] `PlainText` (for search)
- [ ] `CreatedAt`, `UpdatedAt`

Constraints:
- [ ] Unique `(BookId, Order)`
- [ ] Unique `(BookId, Slug)`
- [ ] FK `BookId` required

---

### 3.4 IngestionJob
Required fields:
- [ ] `Id`
- [ ] `BookId` (FK → Book)
- [ ] `Status` (Queued | Running | Succeeded | Failed)
- [ ] `Progress` (0–100) (optional)
- [ ] `Error` (nullable)
- [ ] `CreatedAt`, `StartedAt`, `FinishedAt`

Constraints:
- [ ] FK `BookId` required
- [ ] Index on `(Status, CreatedAt)` for worker polling

---

## 4. Search Requirements (FTS)

- [ ] `Chapter.PlainText` must exist
- [ ] Use PostgreSQL Full-Text Search
- [ ] Store `tsvector` in DB (materialized) OR generate on the fly (MVP prefer materialized)

Minimum:
- [ ] `Chapter.SearchVector` (`tsvector`)
- [ ] GIN index on `SearchVector`

---

## 5. Authentication-Dependent Data

If using ASP.NET Core Identity:
- [ ] `AspNetUsers` is the canonical user table

Otherwise:
- [ ] `Users` table must exist and store Google subject

---

## 6. User Feature Tables (Required for MVP)

### 6.1 UserLibrary
Fields:
- [ ] `UserId` (FK)
- [ ] `BookId` (FK)
- [ ] `CreatedAt`

Constraints:
- [ ] Unique `(UserId, BookId)`
- [ ] FK delete behavior: deleting a book should delete saved entries (cascade) OR block delete (restrict). Choose one and document it.

---

### 6.2 ReadingProgress
Fields:
- [ ] `UserId` (FK)
- [ ] `BookId` (FK)
- [ ] `ChapterId` (FK)
- [ ] `Locator` (text/json)
- [ ] `UpdatedAt`

Constraints:
- [ ] Unique `(UserId, BookId)`
- [ ] `ChapterId` must belong to `BookId` (enforce at app level; optional DB constraint)

---

### 6.3 Bookmark (Phase 4)
Fields:
- [ ] `Id`
- [ ] `UserId` (FK)
- [ ] `BookId` (FK)
- [ ] `ChapterId` (FK)
- [ ] `Locator`
- [ ] `Label` (optional)
- [ ] `CreatedAt`

---

### 6.4 Note (Phase 4)
Fields:
- [ ] `Id`
- [ ] `UserId` (FK)
- [ ] `BookId` (FK)
- [ ] `ChapterId` (FK)
- [ ] `Locator`
- [ ] `SelectedText` (optional)
- [ ] `Body`
- [ ] `CreatedAt`, `UpdatedAt`

---

## 7. Content Safety Requirements (HTML)

- [ ] Chapter HTML must be sanitized:
  - remove `<script>`
  - strip dangerous attributes (`on*`, `javascript:` URLs)
- [ ] Only allow safe tags needed for reading (p, h1–h6, em, strong, blockquote, ul/ol/li, img optional)

---

## 8. Deletion & Retention Rules (MVP)

- [ ] Deleting a book:
  - must remove chapters + derived DB content
  - must not accidentally delete original files unless explicitly requested
- [ ] Deleting a user:
  - must delete user-specific data (library/progress/notes/bookmarks)

---

## 9. Acceptance Criteria

- [ ] One uploaded EPUB becomes a Book + BookFile + Chapters + SearchVector
- [ ] Public endpoints can render chapters from DB HTML
- [ ] Search works across Chapter.PlainText
- [ ] UserLibrary and ReadingProgress are enforced by FK + unique constraints
