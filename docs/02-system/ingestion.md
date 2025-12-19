# Book Ingestion Pipeline

Upload → Parse → Publish flow for EPUB/PDF/FB2 books.

## Overview

```
Admin Upload → Storage → IngestionJob → Worker → Chapters → Published
```

## 1. Upload (Admin API)

### Endpoint
```
POST /admin/books/upload
Content-Type: multipart/form-data
```

### Request
- `file`: Book file (EPUB, PDF, FB2)
- `siteId`: Target site
- `language`: en, uk
- `workId`: Optional (link to existing Work)

### Process
1. Validate file type and size
2. Save to storage: `/storage/books/{editionId}/original/{filename}`
3. Create Edition (status=Draft)
4. Create BookFile record
5. Create IngestionJob (status=Queued)
6. Return job ID

### Response
```json
{
  "editionId": "uuid",
  "jobId": "uuid",
  "status": "Queued"
}
```

## 2. Worker Processing

### Polling
Worker polls every 5 seconds:
```sql
SELECT * FROM ingestion_jobs
WHERE status = 'Queued'
ORDER BY created_at
LIMIT 1
```

### State Machine
```
Queued → Processing → Succeeded
                   → Failed
```

### Processing Steps

1. **Fetch job** with Edition, BookFile
2. **Set status** = Processing, started_at = now
3. **Parse book** via format-specific parser
4. **Extract chapters**:
   - HTML content (sanitized)
   - Plain text (for FTS)
   - Word count
5. **Insert chapters** with auto-generated slugs
6. **Update Edition**: status=Published, published_at=now
7. **Set job status** = Succeeded, finished_at = now

### Error Handling
On failure:
- status = Failed
- error = exception message
- Retry via attempt_count

## 3. Parsers

### EPUB Parser
- Uses VersOne.Epub library
- Extracts: title, authors, chapters
- Cleans HTML: removes scripts, dangerous attrs

### Supported Formats
| Format | Status | Parser |
|--------|--------|--------|
| EPUB | ✅ Done | EpubParser |
| PDF | 🚧 Planned | — |
| FB2 | 🚧 Planned | — |

## 4. Chapter Generation

### Slug Generation
```
Chapter 1 → chapter-1
Introduction → introduction
Глава 1 → glava-1
```

### HTML Sanitization
Removed:
- `<script>` tags
- `on*` event handlers
- `javascript:` URLs

Allowed:
- Headings (h1-h6)
- Text (p, span, em, strong)
- Lists (ul, ol, li)
- Blockquotes
- Images (src rewritten)

### FTS Vector
```sql
UPDATE chapters
SET search_vector = to_tsvector('english', plain_text)
WHERE id = @id
```

## 5. Key Files

| File | Purpose |
|------|---------|
| `Api/Endpoints/AdminEndpoints.cs` | Upload endpoint |
| `Application/Admin/AdminService.cs` | Upload logic |
| `Worker/Services/IngestionWorker.cs` | Job polling |
| `Worker/Services/IngestionService.cs` | Processing logic |
| `Worker/Parsers/EpubParser.cs` | EPUB extraction |

## 6. Monitoring

### Job Status API
```
GET /admin/ingestion/jobs
GET /admin/ingestion/jobs/{id}
```

### Logs
Worker logs to stdout (visible in `docker logs worker`).

## See Also

- [Database: IngestionJob entity](database.md)
- [Admin Panel](admin.md)
