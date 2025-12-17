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

### Changed
- `Chapter` now references `Edition` instead of `Book`
  - Merged content fields: title, html, plain_text, word_count, search_vector
  - Removed `ChapterTranslation` (content now per-edition)
- `IngestionJob` updated with:
  - `TargetLanguage` - en/uk
  - `WorkId` - optional link to existing work
  - `SourceEditionId` - required for translations
- `ReadingProgress`, `Bookmark`, `Note`, `BookFile` - all now use `EditionId`

### Removed
- `Book` entity (replaced by Work + Edition)
- `BookTranslation` entity (merged into Edition)
- `ChapterTranslation` entity (merged into Chapter)
- `BookStatus` enum (replaced by EditionStatus)

### Migration
- `Initial_WorkEdition_Admin` - Fresh migration with new schema
