# PDD: Multisite — General + Programming (rename Fiction -> General)

## Status
Draft

## Goal
Launch with two audience-based sites:
- **General** (student-first aggregator; default site)
- **Programming** (developer-focused vertical)

Additionally, rename the current site key/name **"fiction"** to **"general"** across the codebase and documentation.

## Current State
- Multisite exists with `site=fiction` and `site=programming` in web query param for local testing.  [oai_citation:1‡GitHub](https://github.com/mrviduus/onlinelib)
- Production intent: resolve site via **Host header** (fiction.example.com, programming.example.com).  [oai_citation:2‡GitHub](https://github.com/mrviduus/onlinelib)
- Backend has `SiteResolver` and `SiteContextMiddleware` (see README paths).  [oai_citation:3‡GitHub](https://github.com/mrviduus/onlinelib)
- Frontend has `SiteContext` and `sites.ts` for theming (see README paths).  [oai_citation:4‡GitHub](https://github.com/mrviduus/onlinelib)

## Non-goals
- Adding a third site (e.g., Students) at this stage
- Changing user/account scoping model (accounts remain global)
- SEO strategy overhaul beyond renaming the site identity
- New UI/branding beyond basic naming + theme label updates

## User-visible behavior
### Local dev (web)
- `http://localhost:5173/?site=general` loads the **General** theme
- `http://localhost:5173/?site=programming` loads the **Programming** theme
- `?site=fiction` should be supported temporarily as an alias (optional but recommended for smoother transition)

### Production-like behavior (host-based)
- `general.example.com` (or main domain) resolves to **General**
- `programming.example.com` resolves to **Programming**
- Existing deployments using `fiction.example.com` (if any) should be treated as:
  - redirect to general (ideal), or
  - alias mapping (acceptable for a transition period)

## Technical Approach

### 1) Canonical Site Keys
Define canonical site keys:
- `general`
- `programming`

Deprecate:
- `fiction` (alias only)

### 2) Rename across the codebase
Update all occurrences of:
- `fiction` -> `general`
- `Fiction` -> `General`
- "ClassicReads" -> "General" (or keep the internal theme name if you want, but UI label should be General)

Expected touch points (based on README):
- Backend: `backend/src/Api/Sites/*` (resolver/middleware)  [oai_citation:5‡GitHub](https://github.com/mrviduus/onlinelib)
- Frontend: `apps/web/src/context/SiteContext.tsx`, `apps/web/src/config/sites.ts`  [oai_citation:6‡GitHub](https://github.com/mrviduus/onlinelib)
- Docs: README + `/docs/*` multisite docs
- Dev URLs/examples: replace `?site=fiction` -> `?site=general`  [oai_citation:7‡GitHub](https://github.com/mrviduus/onlinelib)

### 3) Backward compatibility (recommended)
Support `fiction` as an alias for `general` for a limited time:
- In `SiteResolver`, map `fiction` -> `general`
- If you have host-based resolution, also map `fiction.*` host -> general
- Consider logging a warning when `fiction` is used (dev-only)

### 4) Data / DB considerations
If the database stores `site_id` as a GUID referencing a Sites table:
- no DB data change required (only display/key mapping changes)

If the database stores the literal key/string `fiction` in records:
- add a migration to update existing rows:
  - `UPDATE ... SET site_key='general' WHERE site_key='fiction';`
- keep alias mapping anyway for safety

(Choose the correct path based on how site is persisted today.)

## Acceptance Criteria
- `?site=general` works and shows the General theme
- `?site=programming` works and shows the Programming theme
- `?site=fiction` (if implemented as alias) still works but resolves to General
- Host-based resolution supports `general.*` and `programming.*`
- No references to "fiction" remain in user-facing docs/UI (except in an explicit "deprecated alias" note, if you keep it)
- Build passes (backend + web + tests)

## Test Plan (TDD)

### Unit tests
1) **SiteResolver maps query param**
- `site=general` -> General
- `site=programming` -> Programming
- `site=fiction` -> General (alias) [if supported]
- unknown -> General (default)

2) **Host-based resolution**
- `Host: general.localhost` -> General
- `Host: programming.localhost` -> Programming
- `Host: fiction.localhost` -> General (alias) [if supported]
- empty/unknown -> General

### Integration tests (smoke)
1) Web responds under site modes (if you have test harness)
- GET `/` with site context set to General vs Programming returns 200

2) API recognizes site context (if API behavior differs by site)
- Request with `Host: programming.localhost` creates `SiteContext=Programming` (assert via a debug/test endpoint or middleware hook in test environment)

## Rollout / Migration Notes
- Keep `fiction` alias for 2–4 weeks (or a fixed number of releases), then remove it in a follow-up ADR/PDD.
- If you already published links with `?site=fiction`, alias prevents breakage.
- Update README examples to `?site=general` immediately.  [oai_citation:8‡GitHub](https://github.com/mrviduus/onlinelib)

## Open Questions
- How is `site` persisted today (GUID site_id vs string key)? (Answer by inspecting DB schema)
- Do we want `general` to be the default site without needing any query param?
- Do we want to keep internal theme names (e.g., ClassicReads) but show “General” in UI, or rename theme identifiers too?