# SEO Index Drop — Investigation Task for Claude Code

**Context for Claude Code**: Vasyl ran a Cowork analysis on 2026-05-19 against Ahrefs Site Audit, Google Search Console, and the live site. Index dropped sharply after **2026-05-12**. This document is the handoff — it lists symptoms, the root cause hypothesis, and the exact files/commands to verify and fix.

## Symptoms (observed, not assumed)

1. **GSC `Page indexing` (textstack.app, last update 2026-05-14)**
   - Indexed: **331**
   - Not indexed: **3,320** across 11 reasons
   - Top reasons:
     - `Excluded by 'noindex' tag` — 2,112 (mostly reader/library — intentional)
     - `Crawled — currently not indexed` — **639** (Google quality demotion)
     - `Not found (404)` — **149**
     - `Page with redirect` — 108
     - `Soft 404` — **83**
     - `Server error (5xx)` — 76
     - `Duplicate, Google chose different canonical` — 65

2. **Ahrefs Site Audit (crawl 2026-05-19)**
   - `404 page` — **130**, all are author URLs e.g. `/en/authors/william-makepeace-thackeray/`, `/en/authors/d-h-lawrence/`, `/en/authors/arnold-bennett/`, `/en/authors/margaret-oliphant/`, `/en/authors/ambrose-bierce/`, `/en/authors/kenneth-grahame/`, `/en/authors/ethel-voynich/`, `/en/authors/j-j-connington/`, `/en/authors/thomas-de-quincey/`, `/en/authors/harry-harrison/` (and 120 more)
   - All 130 are linked from `/en/books/...` detail pages
   - `Page has broken JavaScript` — **1,815** referencing `/assets/index-Dj8T4aeH.js` (status was 404 during Ahrefs crawl, **200 now** → bundle hash changed during deploy and stale SSG HTML still referenced old name)
   - `Duplicate pages without canonical` — 7
   - `Noindex page` — 1,412 (consistent with reader/library noindex routes; not the issue)

3. **Live HTTP behavior verified from browser fetch (2026-05-19)**
   - `https://textstack.app/en/books/dracula/` → 200, **`X-SEO-Render: spa`** — but `CLAUDE.md` says this URL MUST return `X-SEO-Render: ssg`.
   - Same for `/en/authors/jane-austen/`, `/en/authors/`, `/en/genres/`. Every URL tested returned `spa` even with `User-Agent: Googlebot`.
   - **Note**: browser `fetch()` may not propagate custom `User-Agent` headers — re-test with `curl -H "User-Agent: Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"` from a host that can reach the production server, NOT from inside Docker.

4. **Sitemap vs internal links mismatch**
   - `https://textstack.app/sitemaps/authors.xml` → only **56 authors**
   - But book detail pages link to **130+ author URLs** that are NOT in the sitemap
   - `william-makepeace-thackeray` is reachable in the browser (SPA renders it fine — there's an Author entity in the DB) but is not in the authors sitemap

## Root-cause hypothesis (in priority order)

### H1 — SSG dist is stale or missing for many authors (HIGH confidence)

`infra/nginx/textstack.conf` routes bots through:
```nginx
location ~ ^/en/authors/[^/]+/?$ {
    add_header X-SEO-Render $seo_render_tag always;
    try_files $ssg_file @spa;   # $ssg_file = /ssg$uri/index.html for bots
}

location @spa {
    if ($is_bot) {
        return 404 '...';   # ← HARD 404 by design when SSG file missing
    }
    ...
}
```

If `data/ssg/en/authors/william-makepeace-thackeray/index.html` does not exist, Ahrefs/Googlebot get a real HTTP 404. This is **by design** (comment says "prevents Google Soft 404") but combined with author URLs being linked from book pages while NOT having SSG generated, it bleeds 404s.

**Verify on the server**:
```bash
ssh into prod, then:
ls /home/vasyl/projects/onlinelib/textstack/data/ssg/en/authors/ | wc -l
ls /home/vasyl/projects/onlinelib/textstack/data/ssg/en/authors/william-makepeace-thackeray/index.html
# Also compare to authors that ARE in the sitemap:
ls /home/vasyl/projects/onlinelib/textstack/data/ssg/en/authors/jane-austen/index.html

# Check ssg-worker is running
docker compose ps ssg-worker
docker compose logs --tail 200 ssg-worker

# Check the periodic rebuild worker (Api hosts it: SsgPeriodicRebuildWorker)
docker compose logs api 2>&1 | grep -i ssg | tail -50
```

Then check what changed in git between 2026-05-11 and 2026-05-19:
```bash
cd /Users/vasylvdovychenko/projects/textstack/textstack
git log --since=2026-05-11 --until=2026-05-19 --oneline
git log --since=2026-05-11 --until=2026-05-19 -- apps/web/scripts/prerender.mjs backend/src/Api/Services/SsgPeriodicRebuildWorker.cs infra/nginx/textstack.conf
```

### H2 — Book detail pages link to unpublished authors (HIGH confidence)

`apps/web/sitemaps/authors.xml` only lists 56 published authors, but `BookDetailPage.tsx` (or wherever book→author links render) emits links to **all** authors associated with editions — including unpublished ones. Those orphan author URLs get crawled, hit `@spa`, and return 404 to bots.

**Investigate**:
```bash
# Find where book pages render author links
grep -rn "authors/" apps/web/src/pages/ apps/web/src/components/ | grep -v "node_modules" | head -30

# Find sitemap generation logic (likely in Api)
grep -rn "sitemap" backend/src/Api/Endpoints/ | head -20

# Compare: which editions have authors that aren't in the sitemap?
# SQL on prod:
docker compose exec db psql -U app books -c "
SELECT a.slug, a.name, e.status AS edition_status
FROM authors a
JOIN edition_authors ea ON ea.author_id = a.id
JOIN editions e ON e.id = ea.edition_id
WHERE e.status = 'Published'
  AND a.slug NOT IN (
    SELECT a2.slug FROM authors a2
    JOIN edition_authors ea2 ON ea2.author_id = a2.id
    JOIN editions e2 ON e2.id = ea2.edition_id
    WHERE e2.status = 'Published'
    GROUP BY a2.slug
    -- Whatever filter the sitemap uses
  );
"
# (Refine the query against the actual sitemap query in backend code.)
```

### H3 — Stale SSG bundle reference from a deploy on/around 2026-05-12 (MEDIUM)

Ahrefs found 1,815 pages referencing `/assets/index-Dj8T4aeH.js` (404 during their crawl, 200 now). Vite emits hashed filenames; each rebuild changes the hash. If `make rebuild-ssg` runs from an old `apps/web/dist/` without rebuilding the SPA first, the prerendered HTML pins an old hash. On the next SPA rebuild the old `index-*.js` is gone → bots see broken JS → soft-404.

**Investigate**:
```bash
git log --since=2026-05-11 --oneline -- Makefile apps/web/scripts/prerender.mjs .github/workflows/deploy.yml

# Look at the deploy.yml sequence — does it build apps/web BEFORE rebuilding SSG?
cat .github/workflows/deploy.yml
```

## Suggested fix order (verify each before moving on)

1. **`make rebuild-ssg`** on prod. Single command. Should regenerate every SSG file from current DB + current `apps/web/dist`. After it finishes:
   ```bash
   curl -sI -H "User-Agent: Googlebot" https://textstack.app/en/books/dracula/ | grep -i x-seo-render
   # Expect: x-seo-render: ssg
   curl -sI -H "User-Agent: Googlebot" https://textstack.app/en/authors/jane-austen/ | grep -i x-seo-render
   # Expect: x-seo-render: ssg
   ```
   If this alone restores `ssg`, the root cause was either a missed rebuild or a deploy-order bug.

2. **Stop emitting orphan author links.** In whatever component renders the author chip/link on book pages, only render `<Link>` when the author has a published page (or check the same condition the sitemap uses). Otherwise render plain text. File to inspect first: `apps/web/src/pages/BookDetailPage.tsx`, and any author-link sub-component.

3. **Add publish gating to authors mirror what sitemap uses.** Decide a single source of truth (probably `IsPublished` flag on Author entity OR `EXISTS(published edition)` check), then use it in three places: (a) sitemap generator, (b) SSG prerender list in `apps/web/scripts/prerender.mjs`, (c) book→author link rendering.

4. **Re-examine `@spa` hard-404 for bots.** The comment claims it prevents soft-404, which is correct for a bot hitting a *truly* nonexistent URL. But it's currently firing for *valid* URLs that just don't have SSG yet. Two safer options:
   - Make `@spa` for bots return a properly rendered minimal HTML with the page's H1 + canonical (i.e., serve the SPA shell but with server-injected `<title>`, `<h1>`, `<meta description>`, breadcrumb — enough for Google not to call it Soft 404).
   - Or, ensure SSG covers 100% of indexable URLs by tying `SsgPeriodicRebuildWorker` to the sitemap query.

5. **Fix the deploy race.** In `.github/workflows/deploy.yml`, confirm sequence is: build `apps/web` → `docker compose up` → THEN trigger SSG rebuild. If SSG runs against an older `apps/web/dist`, you'll keep getting stale JS-bundle references.

6. **Submit to IndexNow + GSC re-validate.** After fixes deploy: `make rebuild-ssg`, then in GSC click "Validate fix" on each of the failed reasons (Not found 404, Soft 404, Crawled-not-indexed).

## Quick health check Claude Code should run first

```bash
cd /Users/vasylvdovychenko/projects/textstack/textstack

# 1. What deployed between May 11–19?
git log --since=2026-05-11 --until=2026-05-19 --stat | head -200

# 2. Does the local dist look fresh?
ls -lah apps/web/dist/assets/ | head -20
grep -r "index-" apps/web/dist/index.html

# 3. What does prerender.mjs use as its URL list?
sed -n '1,80p' apps/web/scripts/prerender.mjs

# 4. Where do book pages link to authors?
grep -rn "authors/" apps/web/src/pages/BookDetailPage.tsx apps/web/src/components/ | head
```

## Files most likely involved

| Concern | File |
|---|---|
| SSG prerender list | `apps/web/scripts/prerender.mjs` |
| Periodic rebuild trigger | `backend/src/Api/Services/SsgPeriodicRebuildWorker.cs` |
| nginx 404 behavior for bots | `infra/nginx/textstack.conf` (`location @spa`) |
| Sitemap generation | `backend/src/Api/Endpoints/` (search for `sitemap`) |
| Book → author link | `apps/web/src/pages/BookDetailPage.tsx` and any `AuthorLink`/`AuthorChip` component |
| Deploy order | `.github/workflows/deploy.yml`, `Makefile` (`rebuild-ssg` target) |

## Done criteria

- `curl -sI -H "User-Agent: Googlebot" https://textstack.app/en/books/dracula/` returns `X-SEO-Render: ssg`
- Ahrefs re-crawl shows `404 page` ≤ 5 (some 404s are legitimate)
- GSC "Validate fix" passes on Not found (404) and Soft 404
- Sitemap count of authors matches the count of author URLs linked from indexable pages
