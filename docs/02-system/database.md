# OnlineLib Database Schema

## Quick Start
```bash
docker compose up --build
```
All services: API :8080 | Web :5173 | Admin :5174 | DB :5432

---

## Entity Relationship Diagram (ASCII)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CONTENT DOMAIN                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────┐         ┌─────────────┐         ┌───────────┐               │
│   │   Work   │ 1────N  │   Edition   │ 1────N  │  Chapter  │               │
│   │──────────│         │─────────────│         │───────────│               │
│   │ id       │         │ id          │         │ id        │               │
│   │ slug  ●  │         │ work_id  →  │         │ edition_id→│               │
│   │ created  │         │ language    │         │ number    │               │
│   └──────────┘         │ slug     ●  │         │ slug      │               │
│                        │ title       │         │ title     │               │
│                        │ authors_json│         │ html      │               │
│                        │ description │         │ plain_text│               │
│                        │ status      │         │ word_count│               │
│                        │ source_id →○│         │ search_vec│ ← FTS GIN    │
│                        │ cover_path  │         └───────────┘               │
│                        │ is_public   │                                      │
│                        └──────┬──────┘                                      │
│                               │                                             │
│                    ┌──────────┴──────────┐                                  │
│                    │                     │                                  │
│              ┌─────┴─────┐        ┌──────┴──────┐                           │
│              │ BookFile  │        │IngestionJob │                           │
│              │───────────│        │─────────────│                           │
│              │ id        │        │ id          │                           │
│              │ edition_id→        │ edition_id →│                           │
│              │ file_name │        │ book_file_id→                           │
│              │ path      │        │ target_lang │                           │
│              │ format    │        │ status      │                           │
│              │ sha256    │        │ error       │                           │
│              └───────────┘        └─────────────┘                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                               USER DOMAIN                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌────────────┐                                                            │
│   │    User    │──────────────────────────────────────────┐                 │
│   │────────────│                                          │                 │
│   │ id         │                                          │                 │
│   │ email    ● │                                          │                 │
│   │ name       │                                          │                 │
│   │ google_sub●│                                          │                 │
│   │ created    │                                          │                 │
│   └─────┬──────┘                                          │                 │
│         │                                                 │                 │
│    ┌────┼────────────────┬────────────────┐              │                 │
│    │    │                │                │              │                 │
│    ▼    ▼                ▼                ▼              ▼                 │
│ ┌──────────────┐  ┌───────────┐  ┌──────────┐  ┌─────────────┐             │
│ │ReadingProgress│  │ Bookmark  │  │   Note   │  │ UserLibrary │             │
│ │──────────────│  │───────────│  │──────────│  │─────────────│             │
│ │ id           │  │ id        │  │ id       │  │ id          │             │
│ │ user_id    → │  │ user_id → │  │ user_id →│  │ user_id   → │             │
│ │ edition_id → │  │ edition_id→│  │ edition →│  │ edition_id →│             │
│ │ chapter_id → │  │ chapter_id→│  │ chapter →│  │ created_at  │             │
│ │ locator      │  │ locator   │  │ locator  │  └─────────────┘             │
│ │ percent      │  │ title     │  │ text     │   ● unique(user,edition)     │
│ │ updated      │  │ created   │  │ selected │                              │
│ └──────────────┘  └───────────┘  │ is_delete│                              │
│  ● unique(user,edition)          │ created  │                              │
│                                  └──────────┘                              │
│                                   soft delete                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              ADMIN DOMAIN                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌────────────┐         ┌─────────────────┐         ┌───────────────┐     │
│   │ AdminUser  │ 1────N  │AdminRefreshToken│         │ AdminAuditLog │     │
│   │────────────│         │─────────────────│         │───────────────│     │
│   │ id         │         │ id              │         │ id            │     │
│   │ email    ● │         │ admin_user_id → │         │ admin_user_id→│     │
│   │ pass_hash  │         │ token           │         │ action_type   │     │
│   │ role       │         │ expires_at      │         │ entity_type   │     │
│   │ is_active  │         │ created_at      │         │ entity_id     │     │
│   │ created    │         └─────────────────┘         │ payload_json  │     │
│   │ updated    │                                     │ created_at    │     │
│   └────────────┘                                     └───────────────┘     │
│                                                                             │
│   Roles: Admin | Editor | Moderator                                         │
└─────────────────────────────────────────────────────────────────────────────┘

Legend:
  →   Foreign Key
  ●   Unique Index
  ○   Nullable FK (self-ref for translations)
  N   One-to-Many relationship
```

---

## Tables Summary

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `works` | Canonical book identity | → editions |
| `editions` | Language-specific version | → work, → chapters, → book_files |
| `chapters` | Book content + FTS | → edition |
| `book_files` | Original uploaded files | → edition |
| `ingestion_jobs` | Processing queue | → edition, → book_file |
| `users` | Google OAuth users | → progress, bookmarks, notes, library |
| `user_libraries` | Saved books | → user, → edition |
| `reading_progresses` | Resume position | → user, → edition, → chapter |
| `bookmarks` | Saved locations | → user, → edition, → chapter |
| `notes` | User annotations | → user, → edition, → chapter |
| `admin_users` | Admin panel auth | → tokens, → logs |
| `admin_refresh_tokens` | JWT refresh | → admin_user |
| `admin_audit_logs` | Action history | → admin_user |

---

## Detailed Schema

### Content Tables

#### `works`
```sql
id          UUID PRIMARY KEY
slug        VARCHAR UNIQUE NOT NULL
created_at  TIMESTAMPTZ NOT NULL
```

#### `editions`
```sql
id                UUID PRIMARY KEY
work_id           UUID NOT NULL → works(id)
language          VARCHAR NOT NULL  -- "en", "uk"
slug              VARCHAR NOT NULL
title             VARCHAR NOT NULL
description       TEXT
authors_json      TEXT              -- JSON array
status            INT NOT NULL      -- 0=Draft, 1=Published, 2=Hidden
published_at      TIMESTAMPTZ
source_edition_id UUID → editions(id)  -- for translations
cover_path        VARCHAR
is_public_domain  BOOLEAN NOT NULL
created_at        TIMESTAMPTZ NOT NULL
updated_at        TIMESTAMPTZ NOT NULL

UNIQUE(work_id, language)
UNIQUE(slug)
```

#### `chapters`
```sql
id             UUID PRIMARY KEY
edition_id     UUID NOT NULL → editions(id)
chapter_number INT NOT NULL
slug           VARCHAR
title          VARCHAR NOT NULL
html           TEXT NOT NULL
plain_text     TEXT NOT NULL
word_count     INT
search_vector  TSVECTOR          -- GIN indexed for FTS
created_at     TIMESTAMPTZ NOT NULL
updated_at     TIMESTAMPTZ NOT NULL

UNIQUE(edition_id, chapter_number)
INDEX GIN(search_vector)
```

#### `book_files`
```sql
id              UUID PRIMARY KEY
edition_id      UUID NOT NULL → editions(id)
original_name   VARCHAR NOT NULL
storage_path    VARCHAR NOT NULL
format          INT NOT NULL      -- 0=Epub, 1=Pdf, 2=Fb2
sha256          VARCHAR
uploaded_at     TIMESTAMPTZ NOT NULL
```

#### `ingestion_jobs`
```sql
id                UUID PRIMARY KEY
edition_id        UUID NOT NULL → editions(id)
book_file_id      UUID NOT NULL → book_files(id)
target_language   VARCHAR NOT NULL
work_id           UUID → works(id)
source_edition_id UUID → editions(id)
status            INT NOT NULL      -- 0=Queued, 1=Processing, 2=Done, 3=Failed
attempt_count     INT NOT NULL
error             TEXT
created_at        TIMESTAMPTZ NOT NULL
started_at        TIMESTAMPTZ
finished_at       TIMESTAMPTZ
```

---

### User Tables

#### `users`
```sql
id             UUID PRIMARY KEY
email          VARCHAR(255) NOT NULL UNIQUE
name           VARCHAR(255)
google_subject VARCHAR(255) NOT NULL UNIQUE
created_at     TIMESTAMPTZ NOT NULL
```

#### `user_libraries`
```sql
id         UUID PRIMARY KEY
user_id    UUID NOT NULL → users(id) CASCADE
edition_id UUID NOT NULL → editions(id) CASCADE
created_at TIMESTAMPTZ NOT NULL

UNIQUE(user_id, edition_id)
```

#### `reading_progresses`
```sql
id         UUID PRIMARY KEY
user_id    UUID NOT NULL → users(id) CASCADE
edition_id UUID NOT NULL → editions(id) CASCADE
chapter_id UUID NOT NULL → chapters(id) CASCADE
locator    TEXT NOT NULL   -- JSON: {"type":"text","chapterId":"...","offset":123}
percent    FLOAT
updated_at TIMESTAMPTZ NOT NULL

UNIQUE(user_id, edition_id)
```

#### `bookmarks`
```sql
id         UUID PRIMARY KEY
user_id    UUID NOT NULL → users(id) CASCADE
edition_id UUID NOT NULL → editions(id) CASCADE
chapter_id UUID NOT NULL → chapters(id) CASCADE
locator    TEXT NOT NULL
title      VARCHAR
created_at TIMESTAMPTZ NOT NULL
```

#### `notes`
```sql
id            UUID PRIMARY KEY
user_id       UUID NOT NULL → users(id) CASCADE
edition_id    UUID NOT NULL → editions(id) CASCADE
chapter_id    UUID NOT NULL → chapters(id) CASCADE
locator       TEXT NOT NULL
text          TEXT NOT NULL
selected_text TEXT
is_deleted    BOOLEAN NOT NULL DEFAULT false  -- soft delete
created_at    TIMESTAMPTZ NOT NULL
updated_at    TIMESTAMPTZ NOT NULL
```

---

### Admin Tables

#### `admin_users`
```sql
id            UUID PRIMARY KEY
email         VARCHAR NOT NULL UNIQUE
password_hash VARCHAR NOT NULL
role          INT NOT NULL      -- 0=Admin, 1=Editor, 2=Moderator
is_active     BOOLEAN NOT NULL DEFAULT true
created_at    TIMESTAMPTZ NOT NULL
updated_at    TIMESTAMPTZ NOT NULL
```

#### `admin_refresh_tokens`
```sql
id            UUID PRIMARY KEY
admin_user_id UUID NOT NULL → admin_users(id) CASCADE
token         VARCHAR NOT NULL UNIQUE
expires_at    TIMESTAMPTZ NOT NULL
created_at    TIMESTAMPTZ NOT NULL
```

#### `admin_audit_logs`
```sql
id            UUID PRIMARY KEY
admin_user_id UUID NOT NULL → admin_users(id) RESTRICT
action_type   VARCHAR NOT NULL
entity_type   VARCHAR NOT NULL
entity_id     UUID
payload_json  TEXT
created_at    TIMESTAMPTZ NOT NULL

INDEX(action_type)
INDEX(admin_user_id)
INDEX(created_at)
```

---

## Enums

```csharp
EditionStatus { Draft=0, Published=1, Hidden=2 }
BookFormat    { Epub=0, Pdf=1, Fb2=2 }
JobStatus     { Queued=0, Processing=1, Completed=2, Failed=3 }
AdminRole     { Admin=0, Editor=1, Moderator=2 }
```

---

## Implementation Status

| Feature | Schema | API | UI |
|---------|--------|-----|-----|
| Work/Edition model | ✅ | ❌ | ❌ |
| Chapters + FTS | ✅ | ❌ | ❌ |
| File upload | ✅ | ❌ | ❌ |
| Ingestion queue | ✅ | ❌ | ❌ |
| User (Google OAuth) | ✅ | ❌ | ❌ |
| User Library | ✅ | ❌ | ❌ |
| Reading Progress | ✅ | ❌ | ❌ |
| Bookmarks | ✅ | ❌ | ❌ |
| Notes | ✅ | ❌ | ❌ |
| Admin Auth | ✅ | ❌ | ❌ |
| Admin Audit | ✅ | ❌ | ❌ |

---

## Migrations

1. `Initial_WorkEdition_Admin` - Full schema
2. `Add_UserLibrary_UserFields` - User.Email, User.Name, User.GoogleSubject, UserLibrary table

---

## Key Design Decisions

1. **Work/Edition split** - Enables multilingual support (same book, different languages)
2. **Edition.SourceEditionId** - Links translations to original
3. **Soft delete on Notes** - Preserves user data, enables sync
4. **FTS in Chapter** - PostgreSQL tsvector + GIN for search
5. **Separate Admin auth** - AdminUser != User (different auth flows)
6. **UserLibrary** - Many-to-many User↔Edition for "My Library"
