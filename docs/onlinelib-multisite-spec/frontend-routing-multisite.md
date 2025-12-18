# Frontend Routing & Host-Based Site Resolution Spec

This spec describes how the web app determines the active site and applies:
- theme/layout
- navigation
- SEO metadata
- content filtering (by site)

Assumes React web frontend + ASP.NET API.

---

## 1) Site resolution flow

### Inputs
- `window.location.host` (frontend)
- `Host` header (backend)

### Backend is the source of truth
Even if frontend infers the site, the backend must validate it.

**API contract (recommended):**
- `GET /api/site/context`
  - returns `siteCode`, `siteId`, `theme`, `defaultLanguage`, `features`, `adsEnabled`, `indexingEnabled`
  - caches aggressively (ETag / 5–15 min)

Example response:
```json
{
  "siteId": "uuid",
  "siteCode": "fiction",
  "primaryDomain": "fiction.example.com",
  "theme": "fiction",
  "defaultLanguage": "en",
  "features": { "notes": true, "bookmarks": true },
  "adsEnabled": true,
  "indexingEnabled": true
}
```

### Failure behavior
- Unknown host → 404 (or 410) on public pages
- API returns 404 for `/api/site/context` too

---

## 2) Routing structure (per site)

Even with different sites, keep a consistent baseline route set:
- Home: `/`
- Book: `/book/:slug`
- Chapter: `/book/:slug/chapter/:n`
- Author index (if enabled): `/authors`
- Author page: `/author/:slug`
- Search: `/search?q=...`

But **site-specific sections** can differ:
- Education site: `/subjects/...`
- Science site: `/fields/...`

### IMPORTANT
Do not reuse the same UI/IA blindly:
- Fiction: author-first browsing
- Programming: topic/subject-first browsing
- Science: field/keyword-first browsing

---

## 3) Theming

Recommended approach:
- `ThemeProvider` selects token set based on `siteContext.theme`.
- Keep shared components in `web/sites/shared`.

Example folder layout:
```
web/
  sites/
    shared/
      components/
      reader/
    fiction/
      theme.ts
      routes.tsx
      nav.ts
    programming/
      theme.ts
      routes.tsx
      nav.ts
    science/
      theme.ts
      routes.tsx
      nav.ts
```

---

## 4) SEO meta rules (frontend)

### Canonical
Canonical must match current host:
- `https://${window.location.host}${pathname}`

### OpenGraph
Per-site defaults:
- `og:site_name`
- `og:image` default (site branding)
- description templates per content type

### Indexing flag
If `indexingEnabled=false`:
- Add `noindex, nofollow` meta to all pages
- Or block via robots + header (but meta is simplest)

---

## 5) Sitemaps / robots are backend-owned
Do not generate sitemaps on the frontend.
Routes:
- `GET /robots.txt`
- `GET /sitemap.xml`
- `GET /sitemaps/...`

All depend on `Host` header.

---

## 6) API filtering by site
Frontend never passes `siteId` explicitly for public reads (to avoid spoofing).
Backend infers site from host and applies filtering.

Public endpoints example:
- `GET /api/books/:slug` → resolves within current site only
- `GET /api/books/:slug/chapters/:n`

Admin endpoints may accept `siteId` but require auth.

---

## 7) Analytics (recommended)
Keep separate measurement per domain:
- separate GA/Matomo property
- or one property with hostname segmentation

Ads:
- enable/disable per site via site context
