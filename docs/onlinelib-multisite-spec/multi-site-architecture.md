# OnlineLib Multi-Site Architecture Spec

**Goal:** run multiple public websites (different domains + SEO identity + UI), backed by **one** backend/worker/admin + one PostgreSQL + one storage directory.

Examples of sites (codes are illustrative):
- `fiction` — fiction/classics reader
- `programming` — programming/CS education
- `science` — science/non-fiction (physics/chemistry/etc.)

## Non-goals
- Not separate repos per site.
- Not separate ingestion pipelines per site.
- No duplicated public content across sites (1 work/edition belongs to exactly 1 site).

---

## High-level Design

### Runtime view
- **One** API service
- **One** Worker service (ingestion)
- **One** Admin tool (private)
- **One** PostgreSQL database
- **One** file storage root (bind-mounted host dir)

Public surface:
- Multiple domains (or subdomains) point to the same web app/API.
- The system resolves **Site** by `Host` header and applies:
  - theming / nav / layout
  - SEO metadata & sitemap/robots
  - content filters (only content assigned to that site)

### Site resolution
**Input:** `Host` header (e.g., `fiction.example.com`)  
**Output:** `site_id` + `site_code` + config (theme, languages, ads toggles, etc.)

Resolution rules:
1. Exact domain match in DB (`sites.domain`)
2. Optional fallback mapping table (`site_domains`) if multiple domains per site
3. Safe default: reject unknown hosts (return 404) to avoid accidental indexing

---

## Data ownership rules (hard rules)

### Rule A — content isolation
Every public content unit must be assigned to a `site_id`.
- A work/edition belongs to exactly **one** site.
- A chapter belongs to exactly **one** edition → thus one site.

### Rule B — SEO isolation
Each site has:
- its own sitemap index
- its own `robots.txt`
- its own canonical URLs
- its own OpenGraph + structured data defaults
- its own Search Console property

### Rule C — operational simplicity
Shared pipeline:
- upload original file → stored on disk
- ingestion parses → writes chapters/html to DB
- web reads extracted chapters/html from DB
Original files are never publicly served.

---

## Multisite configuration surface

### Site-level config
Recommended site settings (stored in DB, not env):
- `code` (stable identifier, e.g. `fiction`)
- `primary_domain`
- `default_language`
- `supported_languages` (optional)
- `theme` (e.g. color tokens / font family key)
- `ads_enabled` (bool)
- `indexing_enabled` (bool) — allow turning off indexing for new sites until ready
- `sitemap_enabled` (bool)
- `features_json` (feature flags: notes, bookmarks, etc.)

---

## SEO specification (per-site)

### robots.txt
- Served dynamically per host
- Should include sitemap URL of that host

### Canonical
- Canonical must always point to the **same host** that served the content.

### Sitemaps
- `/sitemap.xml` returns a **sitemap index** per site
- Segment:
  - `/sitemaps/books.xml`
  - `/sitemaps/chapters-1.xml`, `/sitemaps/chapters-2.xml` (chunked)
  - `/sitemaps/authors.xml` (if applicable)

### Structured data
Per site, maintain defaults:
- Organization / WebSite schema
- Book schema for book pages
- BreadcrumbList schema for book/chapter pages

---

## Deployment notes (Docker Compose friendly)

### Recommended: one reverse proxy, multiple domains
- Nginx/Caddy/Traefik routes domains to the same `web` container
- The app resolves site by `Host`
- Use per-domain TLS at proxy layer

### Data persistence
- DB volume persists
- Storage directory is a bind mount (host path, e.g. `/srv/books/storage`)

---

## Implementation order (recommended)
1. Add DB structures (`sites`, `site_domains`, and `site_id` FK on content).
2. Add site resolver middleware.
3. Add per-site filtering in queries.
4. Add per-site sitemap/robots/canonical.
5. Add per-site theming in web.
6. Add admin UI to manage sites + domain mapping.
