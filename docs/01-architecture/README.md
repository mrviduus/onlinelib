# System Architecture

Modular monolith: single API + Worker, layered architecture, PostgreSQL.

## High-Level View

```
┌─────────────────────────────────────────────────────────┐
│                    Reverse Proxy                        │
│              (nginx/caddy, TLS termination)             │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│     Web       │   │     API       │   │    Admin      │
│  (React/Vite) │   │ (ASP.NET Core)│   │  (React/Vite) │
│  port 5173    │   │  port 8080    │   │  port 81    │
└───────────────┘   └───────────────┘   └───────────────┘
                            │
                    ┌───────┴───────┬───────────────┐
                    ▼               ▼               ▼
            ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
            │    Worker     │ │   PostgreSQL  │ │  Meilisearch  │
            │ (ingestion)   │ │   port 5432   │ │   (FTS)       │
            └───────────────┘ └───────────────┘ └───────────────┘
                    │               │
                    ▼               │
            ┌───────────────┐       │     ┌───────────────┐
            │   Storage     │◄──────┘     │    Ollama     │
            │ (bind mount)  │             │  gemma4:e4b   │
            └───────────────┘             └───────────────┘
                                          ┌───────────────┐
                                          │LibreTranslate │
                                          └───────────────┘
                                          ┌───────────────┐
                                          │  Edge TTS     │
                                          │ (WebSocket)   │
                                          └───────────────┘
```

## Backend Layers

```
backend/src/
├── Api/              # HTTP endpoints, middleware
│   ├── Endpoints/    # Minimal API route groups
│   ├── Sites/        # SiteResolver, SiteContext
│   └── Middleware/   # Exception handling
├── Application/      # Business logic
│   ├── Books/        # BookService
│   ├── Admin/        # AdminService
│   ├── Ingestion/    # IngestionService
│   ├── Search/       # SearchService
│   └── Sites/        # SiteService
├── Domain/           # Entities, enums (no dependencies)
│   ├── Entities/     # Work, Edition, Chapter, etc.
│   └── Enums/        # EditionStatus, JobStatus
├── Infrastructure/   # EF Core, storage
│   ├── Data/         # AppDbContext, Configurations
│   ├── Migrations/   # EF migrations
│   └── Storage/      # LocalFileStorageService
├── Tts/              # Text-to-Speech
│   └── TextStack.Tts/ # EdgeTtsClient (WebSocket), EdgeTtsService (cache)
├── Worker/           # Background jobs
│   ├── Services/     # IngestionWorker
│   └── Parsers/      # EpubParser
└── Contracts/        # DTOs
```

## Dependency Rules

```
API ──► Application ──► Domain ◄── Infrastructure
                           ▲
                           │
                        Worker
```

- **Domain**: Pure C#, no framework dependencies
- **Application**: Business logic, depends on Domain + interfaces
- **Infrastructure**: Implements interfaces (IAppDbContext, IFileStorageService)
- **API/Worker**: Orchestration, DI configuration

## Key Patterns

### Minimal API
Endpoints grouped by domain:
- `MapBooksEndpoints()` — public book/chapter routes
- `MapAdminEndpoints()` — admin CRUD
- `MapSearchEndpoints()` — FTS search
- `MapVocabularyEndpoints()` — vocabulary SRS + review
- `MapReadingTrackingEndpoints()` — sessions, goals, achievements
- `MapTtsEndpoints()` — text-to-speech synthesis + voice listing

### Background Jobs
Worker polls database for queued jobs:
```
IngestionJob.Status == Queued
  → Processing → Succeeded/Failed
```

### Site Context
Every request:
1. SiteContextMiddleware resolves Host → SiteContext
2. SiteContext.SiteId used in all queries
3. Unknown host → 404

## Frontend Structure

```
apps/
├── web/              # Public reader
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   └── context/  # SiteContext.tsx
│   └── Dockerfile
├── admin/            # Admin panel
└── mobile/           # React Native (later)

packages/             # Shared TS code
├── api-client/       # Generated from OpenAPI
├── sync/             # Offline queue
└── reader/           # Locator format
```

## TTS (Text-to-Speech)

```
┌──────────┐    ┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐
│ Frontend │───►│ GET /api/tts │───►│ EdgeTtsService  │───►│  EdgeTtsClient   │
│ useTts() │    │ TtsEndpoints │    │ (disk cache)    │    │ (WebSocket)      │
└──────────┘    └──────────────┘    └─────────────────┘    └──────────────────┘
     │                                     │                        │
     ▼                                     ▼                        ▼
┌──────────┐                      ┌─────────────────┐    ┌──────────────────┐
│IndexedDB │                      │ data/tts-cache/  │    │ speech.platform  │
│(browser) │                      │ {sha256}.mp3     │    │ .bing.com (wss)  │
└──────────┘                      └─────────────────┘    └──────────────────┘
```

**Flow**: `useTts.speak(text, lang)` → check IndexedDB → miss → `GET /api/tts` → `EdgeTtsService` checks disk cache → miss → `EdgeTtsClient` opens WebSocket → receives MP3 chunks → saves to disk → returns bytes → frontend saves to IndexedDB → plays `<audio>`.

**Cache keys**: Server: `SHA256(text+voice+rate)[:16].mp3`. Client: `{lang}:{SHA256(text)[:16]}`.

## See Also

- [Multisite](multisite.md) — Host resolution and data isolation
- [ADR-006: Modular Monolith](adr/006-modular-monolith.md)
- [Frontend](frontend.md) — Monorepo structure
