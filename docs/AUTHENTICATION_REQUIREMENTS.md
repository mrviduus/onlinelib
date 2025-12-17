# OnlineLib – Authentication & Access Requirements

This document defines **mandatory authentication rules** and **access requirements**
for OnlineLib.  
These rules are part of the MVP and must be respected by backend, frontend, and DB design.

---

## 1. Core Principle

OnlineLib is **content-first and SEO-driven**.

- Reading and searching books must be **public**
- User-specific actions require **authentication**
- Authentication is done **only via Google Sign‑In**

There is **no anonymous user data persistence**.

---

## 2. Public (No Account Required)

The following features must work **without login** and must be crawlable by search engines:

### Pages
- [ ] `/books`
- [ ] `/books/{bookSlug}`
- [ ] `/books/{bookSlug}/chapters/{chapterSlug}`

### Features
- [ ] Read full chapter content
- [ ] Navigate chapters
- [ ] Full‑text search
- [ ] Share URLs

Rules:
- No cookies required
- No redirects to login
- No blocked HTML rendering

---

## 3. Authenticated (Account Required)

The following features **require a Google account**:

### User actions
- [ ] Save reading progress
- [ ] Resume reading
- [ ] Add/remove book to *My Library*
- [ ] View *My Library*
- [ ] Create bookmarks
- [ ] Create notes

### API endpoints (examples)
- [ ] `POST /me/library/{bookId}`
- [ ] `GET /me/library`
- [ ] `PUT /me/progress/{bookId}`
- [ ] `GET /me/progress/{bookId}`
- [ ] `POST /me/bookmarks`
- [ ] `POST /me/notes`

Rules:
- All endpoints require authentication
- Unauthenticated access returns `401`
- Frontend must trigger Google Sign‑In when needed

---

## 4. Authentication Method (Mandatory)

### Provider
- **Google Sign‑In only**

### Backend
- ASP.NET Core Authentication
- External login via Google OAuth
- Session via secure cookies (preferred for web)

### Frontend
- Single action: **“Continue with Google”**
- No password forms
- No email/password login
- No account creation UI

---

## 5. User Creation Rules

- First Google login:
  - [ ] Create local user record
  - [ ] Link Google external login
- Subsequent logins:
  - [ ] Reuse existing user
- Email is trusted from Google
- No manual user registration

---

## 6. Database Requirements (Migrations)

### Required
One of the following **must exist**:

#### Option A (Recommended): ASP.NET Core Identity
- `AspNetUsers`
- `AspNetUserLogins`
- `AspNetUserClaims`
- `AspNetUserTokens`

Used for:
- Google external login mapping
- User identity

#### Option B: Custom Users Table ✅ IMPLEMENTED
- `Users`
  - `Id`
  - `Email` (unique) ✅
  - `Name` ✅
  - `GoogleSubject` (unique) ✅
  - timestamps

---

## 7. User Data Tables (Required)

### UserLibrary ✅ IMPLEMENTED
Stores books saved by users.

Columns:
- [x] `UserId` (FK)
- [x] `EditionId` (FK) — using Edition instead of Book for multilingual
- [x] `CreatedAt`

Constraints:
- Unique `(UserId, EditionId)` ✅

---

### ReadingProgress ✅ IMPLEMENTED
Stores resume location.

Columns:
- [x] `UserId` (FK)
- [x] `EditionId` (FK) — using Edition instead of Book
- [x] `ChapterId` (FK)
- [x] `Locator`
- [x] `UpdatedAt`

Constraints:
- Unique `(UserId, EditionId)` ✅

---

## 8. UX Rules

- Public users:
  - Can read and search freely
  - See soft prompt: *“Sign in to save your place”*
- Auth-required action:
  - Triggers Google Sign‑In
- After login:
  - Redirect back to original page
  - Continue action automatically

---

## 9. Non‑Goals (Explicit)

- ❌ No anonymous saved progress
- ❌ No email/password login
- ❌ No social logins other than Google (for now)
- ❌ No mandatory login to read content

---

## 10. Acceptance Criteria

This requirement is fulfilled when:

- [ ] Google Sign‑In works end‑to‑end
- [ ] Public pages are accessible without login
- [ ] Saving data is impossible without auth
- [ ] DB enforces user ownership via FK
- [ ] No duplicate users are created

---

> Guiding rule: **Public knowledge first. Personal data only with identity.**
