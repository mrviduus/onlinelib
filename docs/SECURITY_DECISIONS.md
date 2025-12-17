# OnlineLib – Security Decisions (MVP)

This document records **security decisions** for the MVP so implementation stays consistent.

---

## 1. Goals

- Protect user-specific data (progress, library, notes)
- Keep public content indexable (SEO)
- Avoid complexity early (no premature microservices)

---

## 2. Authentication (Decision)

- **Google Sign-In only**
- Backend-managed authentication
- Web session uses **secure cookies** (preferred)

Rationale:
- Works cleanly with React web
- Avoids storing tokens in browser storage
- Simplifies API calls (cookie sent automatically)

---

## 3. Cookies (Decision)

Cookie requirements:
- [ ] `Secure` enabled (HTTPS only)
- [ ] `HttpOnly` enabled
- [ ] `SameSite=Lax` (default MVP)
- [ ] Explicit cookie name (e.g. `__onlinelib_auth`)

Notes:
- If you need cross-site usage (separate domains), you may need `SameSite=None; Secure`
  and stricter CORS settings.

---

## 4. CSRF (Decision)

If using cookie auth:
- [ ] Protect state-changing endpoints (POST/PUT/DELETE) with CSRF strategy:
  - antiforgery token, OR
  - double-submit cookie, OR
  - require custom header + same-site cookie rules

Minimum acceptable MVP:
- [ ] SameSite cookie rules + CORS locked down
- [ ] Add CSRF tokens before public launch if endpoints are used cross-site

---

## 5. CORS (Decision)

- [ ] Allow only the web app origin(s)
- [ ] Do not use `*` with credentials
- [ ] Allow credentials if using cookies

Checklist:
- [ ] Dev: allow `http://localhost:{webPort}`
- [ ] Prod: allow `https://your-domain.com` (and only that)

---

## 6. Authorization (Decision)

- Public endpoints: allow anonymous
- User endpoints: require authenticated user
- Admin endpoints: require admin role/claim

Enforcement:
- [ ] Backend must enforce with `[Authorize]` / policy
- [ ] Frontend may hide buttons, but backend is source of truth

---

## 7. Input validation & upload safety (Decision)

Uploads:
- [ ] Enforce file size limits
- [ ] Restrict file types (allowlist)
- [ ] Store files outside web root
- [ ] Sanitize filenames (do not trust client)
- [ ] Use deterministic storage path

Content:
- [ ] Sanitize chapter HTML before storing/serving
- [ ] Strip scripts and dangerous attributes

---

## 8. Secrets management (Decision)

- [ ] No secrets committed to git
- [ ] Use environment variables / docker secrets / user-secrets for dev
- [ ] Rotate Google client secret if leaked

---

## 9. Logging & PII (Decision)

- [ ] Do not log OAuth tokens or authorization codes
- [ ] Avoid logging full request bodies for user endpoints
- [ ] Store minimal user profile fields (email/name/avatar as needed)

---

## 10. Rate limiting (Recommended)

Before public exposure:
- [ ] Rate limit auth endpoints
- [ ] Rate limit search endpoint
- [ ] Rate limit upload endpoint (admin only)

---

## 11. Acceptance Criteria

- [ ] Public pages accessible without login
- [ ] User endpoints return `401` without auth
- [ ] Admin endpoints return `403` without admin privileges
- [ ] Cookies are Secure/HttpOnly and CORS is locked down
- [ ] Chapter HTML is sanitized and safe to render
