# Multisite Architecture

One backend serves multiple branded sites with content isolation and per-site SEO.

## Sites

| Code | Domain | Purpose |
|------|--------|---------|
| general | general.example.com | Student-first aggregator (default) |
| programming | programming.example.com | Developer-focused vertical |

## Site Resolution

### Flow

```
Request → Host header → SiteResolver → SiteContext → All queries
```

1. Middleware extracts `Host` header
2. `SiteResolver` queries `site_domains` or `sites.primary_domain`
3. Returns `SiteContext` with site_id, code, theme, features
4. Unknown hosts → 404

### Dev Override

```
http://localhost:5173/?site=general
http://localhost:5173/?site=programming
```

### Key Files

- `backend/src/Api/Sites/SiteResolver.cs`
- `backend/src/Api/Sites/SiteContextMiddleware.cs`
- `apps/web/src/context/SiteContext.tsx`

## Data Isolation

| Entity | Scoping |
|--------|---------|
| Site | Root entity |
| SiteDomain | FK to Site |
| Work | FK to Site (primary) |
| Edition | FK to Site (denormalized) |
| Chapter | Via Edition |
| ReadingProgress, Bookmark, Note | FK to Site |
| User | Global (cross-site) |

### Hard Rules

1. One Work belongs to exactly one site
2. All public queries must filter by site_id
3. User accounts are global (can use multiple sites)

## SEO per Site

### robots.txt
- Served dynamically per Host
- Includes sitemap URL for that site

### Canonical
- Must point to same host that served content
- No cross-site canonicals

### Sitemaps
- `/sitemap.xml` — index per site
- `/sitemaps/books.xml` — site-scoped
- `/sitemaps/chapters-*.xml` — chunked

### Structured Data
- Per-site Organization schema
- Book schema on book pages
- BreadcrumbList on all pages

## Frontend Routing

### Shared Routes
```
/                           — Home
/book/:slug                 — Book detail
/book/:slug/chapter/:n      — Chapter reader
/search?q=                  — Search
```

### Per-Site Sections
- General: broad, student-first browsing
- Programming: topic-first browsing

### Theming

```typescript
// apps/web/src/config/sites.ts
export const sites = {
  general: { name: 'General', color: '#0066CC' },
  programming: { name: 'CodeBooks', color: '#10B981' }
}
```

## API Filtering

Frontend never passes site_id for public reads.
Backend infers site from Host and applies filter.

```csharp
// All public endpoints
var siteId = httpContext.GetSiteId();
var books = await _db.Editions
    .Where(e => e.SiteId == siteId)
    .Where(e => e.Status == EditionStatus.Published)
    .ToListAsync();
```

## Site Configuration

Stored in `sites` table:

| Column | Type | Description |
|--------|------|-------------|
| code | varchar(50) | Stable identifier |
| primary_domain | varchar(255) | Main domain |
| default_language | varchar(10) | en, uk |
| theme | varchar(50) | Theme token |
| ads_enabled | bool | Show ads |
| indexing_enabled | bool | Allow robots |
| sitemap_enabled | bool | Generate sitemap |
| features_json | jsonb | Feature flags |

## See Also

- [ADR-005: Multisite Resolution](adr/005-multisite-resolution.md)
- [Database: Site/SiteDomain entities](../02-system/database.md)
