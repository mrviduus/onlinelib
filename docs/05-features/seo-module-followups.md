# SEO Module MVP — Follow-ups

Completed: 2025-12-25

## Slice 1 Complete

All MVP tasks from `seo-module-mvp-pdd.md` Slice 1 are implemented:
- robots.txt with sitemap reference
- Sitemap index + entity sitemaps (books, chapters, authors, genres)
- Canonical URLs via SeoHead component
- Meta robots (noindex for search pages)
- Meta title & description on all pages
- Verification meta tags (Google + Bing placeholders)
- Author/Genre entities with SEO fields
- Migration of AuthorsJson to Authors table

---

## Follow-up Tasks

### Production Deployment

1. **Fill verification codes in `apps/web/index.html`**
   - Get verification code from Google Search Console
   - Get verification code from Bing Webmaster Tools
   - Replace empty `content=""` values

2. **Submit sitemap to search engines**
   - Google Search Console: submit `https://yourdomain.com/sitemap.xml`
   - Bing Webmaster Tools: submit sitemap URL

---

### Content Management

3. **Add author bios and photos via Admin UI**
   - Authors table exists but bio/photo fields are empty
   - Consider adding admin endpoint for author management

4. **Create genres via Admin UI**
   - Genres table is empty (no seed data)
   - Need admin endpoints for genre CRUD
   - Link editions to genres

5. **Admin endpoints for Authors/Genres**
   - `POST /admin/authors` - create author
   - `PUT /admin/authors/{id}` - update author (bio, photo)
   - `DELETE /admin/authors/{id}` - delete author
   - Same for genres
   - UI pages in admin app

---

### Future Slices (from PDD)

6. **Slice 2 — Admin SEO Control**
   - Editable slug (with redirect on change)
   - SEO preview in admin UI
   - Bulk indexable toggle

7. **Slice 3 — Slug Change Redirects**
   - Redirect table for old slugs
   - Auto-301 on slug change
   - Middleware resolution

8. **Slice 4 — Structured Data**
   - Book JSON-LD schema
   - Author JSON-LD schema
   - Validation against schema.org

---

### Technical Debt

9. **Author slug generation**
   - Current migration generates slugs with regex
   - Some slugs have issues with Cyrillic characters (e.g., `леся-укра-нка` instead of `lesya-ukrainka`)
   - Consider transliteration for consistent Latin slugs

10. **Edition-Author relationship in API responses**
    - `authorsJson` still returned in Edition DTOs
    - Should return proper Author objects instead
    - Breaking change for frontend

---

## Files Changed in This Implementation

### Backend
- `backend/src/Domain/Entities/Edition.cs` - SEO fields
- `backend/src/Domain/Entities/Author.cs` - new entity
- `backend/src/Domain/Entities/Genre.cs` - new entity
- `backend/src/Infrastructure/Persistence/AppDbContext.cs` - DbSets + config
- `backend/src/Infrastructure/Migrations/20251225233053_AddAuthorsGenresSeoFields.cs`
- `backend/src/Api/Endpoints/AuthorsEndpoints.cs` - new
- `backend/src/Api/Endpoints/GenresEndpoints.cs` - new
- `backend/src/Api/Endpoints/SeoEndpoints.cs` - author/genre sitemaps
- `backend/src/Contracts/Admin/EditionDtos.cs` - SEO fields
- `backend/src/Application/Admin/AdminService.cs` - SEO in update
- `backend/Docker/Migrator.Dockerfile` - added Search project

### Frontend Web
- `apps/web/index.html` - verification meta tags
- `apps/web/src/components/SeoHead.tsx` - noindex support
- `apps/web/src/pages/AuthorsPage.tsx` - new
- `apps/web/src/pages/AuthorDetailPage.tsx` - new
- `apps/web/src/pages/GenresPage.tsx` - new
- `apps/web/src/pages/GenreDetailPage.tsx` - new
- `apps/web/src/pages/BooksPage.tsx` - SeoHead added
- `apps/web/src/pages/ReaderPage.tsx` - SeoHead added
- `apps/web/src/pages/SearchPage.tsx` - SeoHead with noindex
- `apps/web/src/api/client.ts` - author/genre API
- `apps/web/src/types/api.ts` - Author/Genre types
- `apps/web/src/styles/books.css` - author/genre styles
- `apps/web/src/App.tsx` - routes

### Frontend Admin
- `apps/admin/src/pages/EditEditionPage.tsx` - SEO fields form
- `apps/admin/src/api/client.ts` - SEO fields in update
