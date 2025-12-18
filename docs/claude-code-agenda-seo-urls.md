# Claude Code Agenda Task

## Title
Refactor book & chapter URLs to be SEO-friendly and human-readable

## Context
We are building a self-hosted online book library and reader with a Kindle-like experience.
The project is content-first and SEO-driven. Google must be able to index book and chapter pages as real HTML pages.

Current URLs are auto-generated and look like this:

```
/books/frankenstein-en-c081e6d7/6892583817065783114_84-h-2.htm.html#letter1
```

This structure is not SEO-friendly, not human-readable, and exposes internal parsing artifacts.

## Goals
Refactor the routing and URL strategy so that:

- URLs are human-readable and semantic
- URLs are stable and SEO-friendly
- Each chapter has its own permanent URL
- Internal database IDs are NOT exposed in URLs
- URLs clearly reflect book title, author (optional), and chapter structure

## Target URL Structure (examples)

```
/books/frankenstein/chapter-4
/books/frankenstein/letters/letter-1
/en/books/frankenstein/chapter-4   (optional language prefix)
```

## Requirements

### Routing
- Use slug-based routing (`bookSlug`, `chapterSlug`)
- Slugs must be stored explicitly in the database (not generated on the fly from IDs)
- Routing must map slugs to internal IDs at the API level

### Backend (ASP.NET Core)
- Add `Slug` fields to Book and Chapter entities
- Add unique indexes on slugs where appropriate
- Resolve `{bookSlug}/{chapterSlug}` to internal IDs via database lookup
- Return proper 404 for missing or unpublished chapters

### Frontend (React)
- Generate links using slugs only
- Do not depend on IDs or file-based names
- Handle 404 gracefully with a user-friendly error page

### SEO Considerations
- Remove `.htm.html` artifacts from URLs
- Do not rely on `#fragment` identifiers for indexable content
- Prepare for future sitemap generation (book + chapter URLs)
- URLs must remain stable once published

## Migration Notes
- If existing URLs are already indexed, propose a 301 redirect strategy
- Avoid breaking links where possible

## Deliverables
- Updated routing design (backend + frontend)
- Database schema changes (if needed)
- Example routes and controllers
- Notes on SEO impact and migration

## Non-Goals
- No SSR framework changes unless strictly required
- No cloud-specific services
- No changes to storage strategy (files remain on disk, content in PostgreSQL)

## Guiding Principle
Optimize for clarity, durability, and long-term SEO growth.
