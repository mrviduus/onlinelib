# Changelog

## [Unreleased]

### Added
- **Public API endpoints**
  - `GET /books` - list published editions (paginated, language filter)
  - `GET /books/{slug}` - edition detail with chapters and other editions
  - `GET /books/{slug}/chapters` - chapter list
  - `GET /books/{slug}/chapters/{chapterSlug}` - chapter content with prev/next nav
  - `GET /search?q=` - full-text search using PostgreSQL tsvector
- **Admin file upload** - `POST /admin/books/upload`
  - Creates Work + Edition + BookFile + IngestionJob
  - Stores files at `/storage/books/{editionId}/original/`
- **Admin ingestion endpoints**
  - `GET /admin/ingestion/jobs` - list jobs
  - `GET /admin/ingestion/jobs/{id}` - job detail
- **EPUB parser** (Worker)
  - VersOne.Epub for parsing
  - HtmlAgilityPack for HTML sanitization
  - Extracts chapters from spine reading order
- **Ingestion worker service**
  - Background polling (5s interval)
  - Parses EPUB → creates Chapter records
  - Updates search_vector via DB trigger
- **Work/Edition data model** - Refactored from Book/Translation to Work/Edition
  - `Work` - canonical work (language-agnostic)
  - `Edition` - language-specific version with `SourceEditionId` for translation links
  - Unique constraint `(work_id, language)` per edition
- **Admin authentication system**
  - `AdminUser` - email, password_hash, role, is_active
  - `AdminRefreshToken` - token-based auth with expiry
  - `AdminAuditLog` - action tracking for admin operations
- **Admin Docker service** - Separate React admin app on port 5174
- **New enums**
  - `AdminRole` - Admin, Editor, Moderator
  - `EditionStatus` - Draft, Published, Hidden
- **UserLibrary table** - for "My Library" feature
  - unique constraint `(user_id, edition_id)`
  - FKs to users + editions

### Changed
- **AdminEndpoints** - extracted `ToResult` helpers, simplified 5 endpoint methods
- `Chapter` now references `Edition` instead of `Book`
  - Merged content fields: title, html, plain_text, word_count, search_vector
  - Removed `ChapterTranslation` (content now per-edition)
- `IngestionJob` updated with:
  - `TargetLanguage` - en/uk
  - `WorkId` - optional link to existing work
  - `SourceEditionId` - required for translations
- `ReadingProgress`, `Bookmark`, `Note`, `BookFile` - all now use `EditionId`
- **User entity** - added fields for Google OAuth
  - `Email` (unique) - user's email from Google
  - `Name` - display name
  - `GoogleSubject` (unique) - Google's sub claim (renamed from ExternalId)
- Swashbuckle → Scalar.AspNetCore for OpenAPI (fixes .NET 10 compat)
- Docker compose defaults - all env vars have defaults, `.env` optional

### Removed
- **fiction→general alias** - removed temp alias from SiteKeys + HostSiteResolver
- `Book` entity (replaced by Work + Edition)
- `BookTranslation` entity (merged into Edition)
- `ChapterTranslation` entity (merged into Chapter)
- `BookStatus` enum (replaced by EditionStatus)

### Migrations
- `Initial_WorkEdition_Admin` - Fresh migration with new schema
- `Add_UserLibrary_UserFields` - User fields + UserLibrary table

---

## Next Up

### OnlineLib.Search Library (feat-0006)
- Provider-agnostic search library (15 slices)
- PostgreSQL FTS provider with Dapper (fix EF Core client evaluation bug)
- Features: highlights, autocomplete, facets
- Document chunking for future vector search
- See [PDD](docs/05-features/feat-0006-search-library.md)

### Phase G: Frontend Reader
- Route `/books/:bookSlug/:chapterSlug`
- Centered text column (720-840px)
- Auto-hide top bar (scroll up/tap → show, scroll down → hide)
- Reader settings: font size, line height, width, theme, font family
- TOC drawer, prev/next navigation
- Progress % indicator, localStorage persistence

### Phase B: Google OAuth
- Cookie-based auth with Google sign-in
- Endpoints: `/auth/google`, `/auth/me`, `/auth/logout`

### Phase D: User API
- `/me/library` - saved books
- `/me/progress` - reading position sync
- `/me/bookmarks`, `/me/notes`
