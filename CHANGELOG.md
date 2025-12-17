# Changelog

## [Unreleased]

### Added
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
- `Book` entity (replaced by Work + Edition)
- `BookTranslation` entity (merged into Edition)
- `ChapterTranslation` entity (merged into Chapter)
- `BookStatus` enum (replaced by EditionStatus)

### Migrations
- `Initial_WorkEdition_Admin` - Fresh migration with new schema
- `Add_UserLibrary_UserFields` - User fields + UserLibrary table
