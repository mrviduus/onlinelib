# ADR-005: Multisite via Host Resolution

**Status**: Accepted
**Date**: 2024-12

## Context

Need to run multiple branded sites (general, programming) from single backend.

Options:
1. Separate deployments per site
2. Path-based routing (/general/...)
3. Host-based resolution

## Decision

Use **Host header resolution** → SiteContext per request.

```
general.example.com → site_id=general
programming.example.com → site_id=programming
```

## Implementation

- `SiteResolver` middleware resolves Host → Site entity
- `SiteContext` injected into HttpContext.Items
- All queries filter by SiteId
- Unknown hosts return 404

Dev override: `?site=general` query param.

## Data Isolation

| Entity | Scoping |
|--------|---------|
| Work | site_id (primary) |
| Edition | site_id (denormalized) |
| ReadingProgress, Bookmark, Note | site_id |
| User | Global (cross-site account) |

## Consequences

### Pros
- Single deployment
- Shared codebase and infrastructure
- Per-site theming/SEO
- Clean domain separation

### Cons
- Must enforce site_id filter everywhere
- Risk of data leakage if filter missed
- Site cache invalidation needed

## Notes

- Sites table stores: code, primary_domain, theme, ads_enabled, indexing_enabled
- SiteDomains table for domain aliases
