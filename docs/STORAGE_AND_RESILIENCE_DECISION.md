# Storage & Resilience Decision (Self‑Hosted MVP)

Date: 2025‑12‑16  
Status: **Final decision for MVP**  
Audience: Project maintainers, agents, future contributors

---

## 1. Goal of This Decision

The goal is to run the entire system on **one self‑hosted machine** (local server / personal computer with internet access) while ensuring that:

- Book files **are never lost** if Docker crashes
- The system is simple to operate and debug
- Backups are straightforward
- The architecture can evolve later without rewrite

This document summarizes the **final agreed approach**.

---

## 2. Key Conclusion (Short Version)

> **Book files must be stored on the host file system, not inside Docker containers and not inside the database.**

Docker containers **mount** the storage directory, but they do not own it.

This guarantees data survival even if:
- containers crash
- Docker daemon restarts
- containers are deleted and recreated

---

## 3. What Is Stored Where

### 3.1 PostgreSQL (Database)
PostgreSQL stores **structured data only**:

- Books metadata (title, author, slug, language)
- Chapter structure
- Extracted chapter text / HTML (SEO + search)
- Reading progress
- Notes, bookmarks, highlights
- Ingestion job status

**PostgreSQL does NOT store binary book files.**

---

### 3.2 Host File System (Permanent Storage)

The following are stored as **real files on disk**:

- Original book files (`.epub`, `.pdf`, `.fb2`, etc.)
- Optional derived assets (covers, cached HTML)

These files live in a dedicated directory on the host machine.

Example:
```
/srv/books/storage/
```

---

## 4. Docker Bind Mount Strategy (Critical)

### 4.1 Why Bind Mounts
Bind mounts ensure that files:

- Exist independently of Docker
- Are visible via SSH / file manager
- Can be backed up with standard tools
- Survive Docker failures

---

### 4.2 Docker Compose Configuration (Example)

```yaml
services:
  api:
    image: books-api
    environment:
      Storage__RootPath: /storage
    volumes:
      - /srv/books/storage:/storage
    restart: unless-stopped

  worker:
    image: books-worker
    environment:
      Storage__RootPath: /storage
    volumes:
      - /srv/books/storage:/storage
    restart: unless-stopped

  db:
    image: postgres:16
    volumes:
      - /srv/books/postgres:/var/lib/postgresql/data
    restart: unless-stopped
```

Result:
- `/srv/books/storage` is the **single source of truth** for files
- Containers only read/write via `/storage`

---

## 5. On‑Disk Directory Structure

Recommended structure inside `/srv/books/storage`:

```
/srv/books/storage
  └── books
      └── {bookId}
          ├── original
          │   └── {assetId}.epub
          └── derived
              ├── cover.jpg
              ├── chapter-0001.html
              └── chapter-0002.html
```

Notes:
- `bookId` and `assetId` are UUIDs from the database
- No filenames depend on user input
- Structure is deterministic and safe

---

## 6. End‑to‑End Flow (Upload → Storage → SEO)

### Step 1: Upload
- Admin uploads a book via API
- API writes file to:
  ```
  /storage/books/{bookId}/original/{assetId}.epub
  ```
- API saves only the **file path** in the database
- Ingestion job is queued

### Step 2: Ingestion (Worker)
- Worker reads the file from `/storage`
- Parses book
- Extracts chapters and text
- Stores extracted content in PostgreSQL

### Step 3: SEO & Reading
- API serves HTML pages from database content
- Original files are never exposed publicly
- Reading and search use extracted text

---

## 7. What Happens If Docker Fails

| Scenario | Outcome |
|-------|--------|
| API container crashes | Files remain on disk |
| Worker crashes | Files remain on disk |
| Docker daemon stops | Files remain on disk |
| Server reboots | Files remain on disk |
| Containers recreated | Files remain on disk |

**As long as `/srv/books/storage` exists, data is safe.**

---

## 8. Backup Strategy (Mandatory)

### 8.1 Database Backup
```bash
pg_dump -U app -d books > /srv/backups/db-$(date +%F).sql
```

### 8.2 File Backup
```bash
tar czf /srv/backups/storage-$(date +%F).tar.gz /srv/books/storage
```

### 8.3 Recommendation
- Run both daily via `cron`
- Store backups on:
  - external HDD, or
  - NAS, or
  - another machine

---

## 9. Why Not Store Files in the Database

Storing book files as `bytea` or blobs would cause:
- large database size
- slow backups
- poor performance
- difficult restores

**File system storage is the correct and proven approach.**

---

## 10. Future Evolution (Optional, Not MVP)

If needed later:
- Introduce MinIO (S3‑compatible storage)
- Swap storage implementation via config
- Keep database schema unchanged

This does **not** block the MVP.

---

## 11. Final Decision Summary

- ✅ Use **host file system (bind mount)** for all book files
- ✅ Keep extracted text and metadata in PostgreSQL
- ✅ Docker containers must never own data
- ✅ Backups are simple and reliable
- ❌ Do not store binary files in the database
- ❌ Do not rely solely on Docker volumes without host visibility

---

## 12. Guiding Principle

> Containers are **ephemeral**.  
> Data must be **permanent**.

This decision is final for the MVP.

---
