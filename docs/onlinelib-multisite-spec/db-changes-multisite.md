# OnlineLib DB Changes Spec: Multi-Site

This document assumes you already have `works`, `editions`, and chapter tables (or similar).
We add `sites` and attach content to a `site_id`.

## Tables

### 1) sites
Stores logical website identity.

```sql
create table sites (
  id uuid primary key,
  code varchar(50) not null unique,             -- e.g. fiction, programming, science
  primary_domain varchar(255) not null unique,  -- e.g. fiction.example.com
  default_language varchar(10) not null,        -- e.g. en, uk
  theme varchar(50) not null default 'default', -- token to select theme bundle
  ads_enabled boolean not null default false,
  indexing_enabled boolean not null default false,
  sitemap_enabled boolean not null default true,
  features_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
```

### 2) site_domains (optional but recommended)
Allows multiple domains/aliases per site (e.g. with/without www).

```sql
create table site_domains (
  id uuid primary key,
  site_id uuid not null references sites(id) on delete cascade,
  domain varchar(255) not null unique,
  is_primary boolean not null default false,
  created_at timestamptz not null
);

create index ix_site_domains_site_id on site_domains(site_id);
```

## Attach site_id to content

### Minimum viable attachment
Attach `site_id` to `works` (or to `editions`). Choose one and be consistent.

**Option A (recommended): `works.site_id`**
- simplest to enforce “work exists on one site”
- editions automatically inherit same site

```sql
alter table works add column site_id uuid;
alter table works
  add constraint fk_works_site_id foreign key (site_id) references sites(id);

create index ix_works_site_id on works(site_id);
```

Also enforce uniqueness per site for slugs (important if different sites may share same slug).

```sql
-- replace prior unique(slug) with unique(site_id, slug)
alter table works drop constraint if exists works_slug_key;
alter table works add constraint uq_works_site_slug unique (site_id, slug);
```

### Editions
If you already have `editions.slug unique`, make it per site too (or derive from work).
If `works` is site-scoped, editions can remain unique globally, but **recommended**:

```sql
alter table editions add column site_id uuid;
update editions e set site_id = w.site_id
from works w
where e.work_id = w.id and e.site_id is null;

alter table editions
  add constraint fk_editions_site_id foreign key (site_id) references sites(id);

-- enforce slug uniqueness per site+language
alter table editions drop constraint if exists editions_slug_key;
alter table editions add constraint uq_editions_site_language_slug unique (site_id, language, slug);
```

### Chapters / extracted content tables
No direct `site_id` needed if they link to `editions` (which is site-scoped).
But it can be added as a denormalization for speed later.

---

## Migration strategy (safe)
1. Create `sites` table.
2. Insert initial site row for your existing domain.
3. Add `site_id` nullable to `works` (+ indexes).
4. Backfill: set all existing rows to the initial site_id.
5. Make `site_id` NOT NULL.
6. Update unique constraints to be site-scoped (site_id, slug).
7. Repeat for `editions` if you choose to store it there too.
8. Add `site_domains` and map your domains.

---

## Query changes (rules)
All public queries must include site filter:
- `where works.site_id = @siteId`
- or `where editions.site_id = @siteId`

Admin queries can be cross-site, but default to a site to avoid mistakes.

---

## Seed data
Seed at least 2 sites (even if only 1 is active) so you test isolation early:
- fiction (indexing_enabled=false initially)
- programming (indexing_enabled=false initially)
