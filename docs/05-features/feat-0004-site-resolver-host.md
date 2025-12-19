# PDD: Host-based Site Resolver (General + Programming)

## Status
Draft

## Goal
Make site resolution deterministic and production-like by resolving the current **Site** from the HTTP request:
- Canonical sites: **general**, **programming**
- Resolution source (canonical): **Host header**
- Dev-only override: `?site=` query parameter
- Temporary alias: **fiction -> general** (until full rename is completed)

This is a foundational feature: all other components must read the site from a single source of truth (SiteContext).

## Non-goals
- Nginx gateway (separate slice)
- UI changes (separate slice)
- DB migrations / content filtering logic (separate slice)
- Adding more sites (students/science/etc.)

## Canonical Site Keys
- `general` (default)
- `programming`
- Alias (temporary): `fiction` -> `general`

## Resolution Rules
### Production (default)
1) Read `Host` from the HTTP request.
2) Determine site from subdomain:
   - `programming.*` => `programming`
   - `general.*` => `general`
   - `fiction.*` => `general` (alias)
3) Unknown/empty host => `general`

### Development override (optional, but recommended)
If environment is Development/Test and query string contains `?site=...`:
- `site=programming` => `programming`
- `site=general` => `general`
- `site=fiction` => `general` (alias)
- unknown => ignore and fall back to Host/default

## Expected Usage
- Backend: a single `SiteResolver` + `SiteContextMiddleware`
- All downstream code reads the resolved site from `SiteContext`
- Frontend may also implement the same resolver for UX, but backend is the source of truth

## Acceptance Criteria (overall)
- Rules above are implemented and test-covered
- `general` is the safe default
- Alias `fiction` works temporarily without breaking anything
- No duplicate site-resolution logic scattered across the codebase

## Slices
- [ ] Slice 1: Add unit tests that define the resolver behavior (RED)
- [ ] Slice 2: Implement `SiteResolver` to make tests pass (GREEN)
- [ ] Slice 3: Add middleware + minimal integration test (SiteContext in request pipeline)
- [ ] Slice 4: Add Nginx gateway for local prod-like host routing

## Test Plan
### Unit (Slice 1–2)
- Host `programming.localhost` => programming
- Host `general.localhost` => general
- Host `fiction.localhost` => general (alias)
- Host `unknown.localhost` => general (default)
- (optional) In Dev/Test: query `?site=programming` overrides host

### Integration (Slice 3)
- Request with `Host=programming.localhost` returns `programming` via a dev/test-only debug endpoint.

## Notes
- Keep alias `fiction` only during the transition. Remove in a follow-up PDD once the rename is complete.