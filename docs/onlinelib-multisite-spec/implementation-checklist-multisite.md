# Multi-Site Implementation Checklist (End-to-End)

Use this checklist in order. Each step should be automatically testable.

## A. Database & Migrations
- [ ] Add `sites` table (+ seed initial site).
- [ ] Add `site_domains` table (optional but recommended).
- [ ] Add `site_id` to `works` (and/or `editions`).
- [ ] Backfill `site_id` for existing rows.
- [ ] Make `site_id` NOT NULL.
- [ ] Change unique constraints to be site-scoped:
  - [ ] `works`: unique(site_id, slug)
  - [ ] `editions`: unique(site_id, language, slug) (if applicable)
- [ ] Add indexes for site filtering.

## B. Backend: Site Resolver
- [ ] Implement `ISiteResolver` that resolves site by Host.
- [ ] Cache resolution in-memory (e.g., 5–15 minutes) with invalidation on admin update.
- [ ] Add middleware to attach `SiteContext` to request scope.
- [ ] Unknown hosts return 404 (public), and block sitemap/robots.

## C. Backend: Query enforcement
- [ ] Update all public read endpoints to filter by `SiteContext.SiteId`.
- [ ] Add integration tests:
  - [ ] host A cannot access host B content (same slug should not leak).
- [ ] Add guardrails:
  - [ ] repository methods require `siteId` parameter or access `SiteContext`.

## D. SEO endpoints
- [ ] `GET /robots.txt` per site
- [ ] `GET /sitemap.xml` per site (index)
- [ ] `GET /sitemaps/books.xml` per site
- [ ] `GET /sitemaps/chapters-*.xml` chunked
- [ ] Add canonical URL per host to page model

## E. Frontend: Site context
- [ ] `GET /api/site/context` on app init
- [ ] Load theme bundle based on site
- [ ] Render site-specific nav + home page
- [ ] Respect `indexingEnabled` flag (noindex)

## F. Admin tool
- [ ] CRUD for `sites`
- [ ] Manage `site_domains`
- [ ] Toggle indexing/sitemaps/ads
- [ ] Assign new books to a site on upload (required field)

## G. Ingestion (Worker)
- [ ] Ensure ingestion job records `site_id`
- [ ] Worker writes parsed content linked to a site-scoped work/edition
- [ ] Validate: worker cannot create cross-site duplicates

## H. CI/CD & Test strategy
- [ ] Unit tests for site resolution logic
- [ ] Integration tests with Host header (WebApplicationFactory)
- [ ] E2E smoke tests (optional early):
  - [ ] two hosts, same slug → different results
  - [ ] sitemaps include only correct site content

## I. Launch order (recommended)
- [ ] Start with 1 public site (indexing on).
- [ ] Add 2nd site with indexing off (noindex + robots disallow).
- [ ] Once content volume is ready: switch indexing on + submit sitemap in GSC.
