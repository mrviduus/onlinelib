# Slice 02 — `/books` → `/discover` URL migration with 301 redirects

**Phase:** 1 (IA foundation) · **Estimated:** 2 days · **Risk:** high (SEO) · **Flag:** none (URL migration, not togglable)

## Goal

Migrate the public catalog from `/books` namespace to `/discover` namespace **without breaking SEO**. All `/books/*` URLs return HTTP 301 (permanent) redirects to `/discover/*` equivalents. Internal links updated. Sitemap regenerated.

This is **the highest-SEO-risk slice in the entire v3 roadmap.** Treat with extra care.

## Acceptance criteria

1. New canonical routes:
   - `/en/discover` (was `/en/books`)
   - `/en/discover/{slug}` (was `/en/books/{slug}`)
   - `/en/discover/authors`, `/en/discover/genres` (was under `/en/books/authors`, `/en/books/genres` if applicable)
2. ALL old `/books/*` URLs return **HTTP 301** redirect to corresponding `/discover/*` URL. Implemented in nginx (preferred) for fewest hops.
3. Sitemap (`apps/web/public/sitemap.xml` or generator) emits `/discover/*` URLs only. Old `/books/*` URLs removed from sitemap.
4. `<link rel="canonical">` on every page now points to `/discover/*` form.
5. Internal links across the entire app (header, footer, BookCard, search results, related books) updated to `/discover/*`. **No code link points to `/books/*` anymore.**
6. Backend internal URL builders (e.g. SSG prerender, SEO pipelines, Meta Open Graph URLs) updated to emit `/discover/*`.
7. SSG (Puppeteer) regenerates pages at the new path. Old `/books/*` SSG files deleted from the build output.
8. Any external URLs in CHANGELOG.md, READMEs, comments — left untouched (historical references).
9. Nginx redirects work BOTH:
   - `/books` → `/discover`
   - `/books/{slug}` → `/discover/{slug}`
   - `/books/authors/{slug}` → `/discover/authors/{slug}`
   - `/books/genres/{slug}` → `/discover/genres/{slug}`
10. Bot detection (per CLAUDE.md nginx config) continues to route crawlers correctly post-redirect — verify Googlebot user-agent gets SSG response on /discover/*.

## Files to touch

| File | Change |
|---|---|
| `infra/nginx/textstack.conf` | Add `rewrite ^/(en\|uk)/books(/.*)?$ /$1/discover$2 permanent;` block. Test with `nginx -t`. |
| `apps/web/src/App.tsx` (or routes file) | Move route definitions from `/books/*` to `/discover/*`. Old routes can stay as components for safety net but no `<Link>` should hit them. |
| `apps/web/src/components/**/*.tsx` | Find-and-replace all `/books/` → `/discover/` in JSX `to=` props and `href=` attributes. |
| `apps/web/src/api/client.ts` (and other API modules) | If API URL builder references `/books/`, update. Probably not — API URLs likely separate from frontend routes. |
| `apps/web/scripts/prerender.mjs` | Change SSG entry list from `/books/*` to `/discover/*`. |
| `apps/web/public/sitemap.xml` (or generator) | Regenerate. Remove `/books/*`, add `/discover/*`. |
| `apps/web/src/components/seo/MetaTags.tsx` (or wherever canonical) | Canonical URL updated. |
| `backend/src/Application/Seo/*` | Any backend code emitting URLs for SEO — update to `/discover/*`. |
| `backend/src/Api/Endpoints/SeoEndpoints.cs` (or SSG/IndexNow) | Verify URL emission. |
| `apps/admin/src/pages/**` | Admin links to public catalog — update to `/discover/*` if any. |
| Submit updated sitemap to Google Search Console (manual step, document in PR). |

## Implementation notes

- **Why nginx for redirects, not React Router?** Permanent (301) redirects at edge are SEO-best-practice. React Router would render the old route briefly, then client-redirect — bad signal to crawlers, worse Core Web Vitals.
- **Order of operations matters:**
  1. Add nginx redirect (deploy)
  2. Verify redirects work in prod (`curl -I https://textstack.app/en/books/dracula` should return 301 with Location header)
  3. THEN merge code change moving frontend routes
  4. THEN regenerate SSG and update sitemap
  Out-of-order causes a window where users hit dead pages.
- **Locale handling:** redirects must preserve language prefix. `/en/books/x` → `/en/discover/x`, `/uk/books/x` → `/uk/discover/x`. Use nginx capture groups.
- **Safety net:** keep old `/books/*` route definitions alive in React Router but mark with `// TODO(my-books-v3 cleanup): remove` for slice 08. If nginx misses something, the React route catches and renders correctly; we just want to KNOW (log warning to telemetry).
- **Search engines** typically take 4-8 weeks to fully recrawl and update. Don't panic if SEO traffic dips slightly the first 2 weeks.
- **Admin / textstack.dev** is unaffected — different host, no public catalog URLs.

## Out of scope

- Public catalog content/design changes — pure URL migration.
- "Discover" navigation in header — slice 01.
- Search index changes — search keys are slugs, not URLs.

## Tests

**Unit:**
- `routes.test.ts` (if exists): old `/books/*` routes do NOT exist in primary route tree.
- `MetaTags.test.tsx`: canonical URL emitted with `/discover/` form.

**Integration / e2e:**
- `apps/web/e2e/tests/discover-redirect.spec.ts` (new):
  - Visit `/en/books/dracula` → expect 301 → expect `Location: /en/discover/dracula` header → expect final landing renders.
  - Same for authors, genres if applicable.
- Test sitemap.xml content: zero `/books/` paths, all `/discover/`.

**Manual SEO sanity:**
- `curl -I https://textstack.app/en/books/dracula` returns `HTTP/2 301` and correct `location:` header.
- Run [Google Mobile-Friendly Test](https://search.google.com/test/mobile-friendly) on a `/discover/*` URL → must pass.
- Open Chrome DevTools, check `<link rel="canonical">` on a `/discover/*` page points to itself.

## Done criterion

```bash
pnpm -C apps/web test --filter "Routes|MetaTags"
pnpm -C apps/web test:e2e --grep "discover-redirect"
pnpm -C apps/web build
nginx -t -c infra/nginx/textstack.conf  # nginx config valid

# Post-deploy smoke (CRITICAL)
for path in "/en/books/dracula" "/en/books/authors/dickens" "/en/books/genres/fiction"; do
  curl -sI "https://textstack.app${path}" | head -3
  # Each must return: HTTP/2 301 + Location header pointing to /discover/...
done

# Sitemap sanity
curl -s https://textstack.app/sitemap.xml | grep -c "/books/"      # must be 0
curl -s https://textstack.app/sitemap.xml | grep -c "/discover/"   # must be > 0

# After 24h: check Google Search Console for any new 4xx errors
```

## Rollback plan

If SEO regression detected within 48h:
1. Revert nginx redirect block (one PR, one config line).
2. Re-deploy.
3. Sitemap can stay updated (Google will re-crawl).
4. Frontend route changes can stay (both `/books/*` and `/discover/*` work in React Router during transition window).

If broader rollback needed: revert PR. All file changes are find-and-replaceable.

## Follow-ups

- 4 weeks post-launch: query Search Console for `/books/*` impressions → should be near zero. If not, investigate why crawler hasn't picked up redirects.
- Slice 08 cleanup: remove `/books/*` React Router fallback routes once metrics confirm zero traffic.
- Update marketing materials, social media bios that link to old `/books/*` URLs.
