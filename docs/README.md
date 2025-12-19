# OnlineLib Documentation

## Quick Links

| Document | Description |
|----------|-------------|
| [Vision](00-vision/README.md) | Goals, principles, stack |
| [Roadmap](00-vision/roadmap.md) | MVP phases, checklists |
| [Architecture](01-architecture/README.md) | System design |
| [Database](02-system/database.md) | Schema, entities |
| [API](02-system/api.md) | Endpoints |
| [Local Dev](03-ops/local-dev.md) | Docker, migrations |

## Structure

```
docs/
├── 00-vision/          # Why: goals, roadmap
├── 01-architecture/    # How: design, ADRs
├── 02-system/          # What: schemas, APIs
├── 03-ops/             # Run: setup, deploy
├── 04-dev/             # Build: test, security
└── archive/            # Historical docs
```

## Reading Order

1. **New to project**: [Vision](00-vision/README.md) → [Architecture](01-architecture/README.md) → [Local Dev](03-ops/local-dev.md)
2. **Backend work**: [Database](02-system/database.md) → [API](02-system/api.md) → [Ingestion](02-system/ingestion.md)
3. **Frontend work**: [Architecture](01-architecture/README.md) → [Multisite](01-architecture/multisite.md) → [Reader](02-system/reader.md)
4. **Ops**: [Local Dev](03-ops/local-dev.md) → [Backup](03-ops/backup.md)

## ADRs (Architectural Decisions)

| ADR | Title |
|-----|-------|
| [001](01-architecture/adr/001-storage-bind-mounts.md) | Storage via bind mounts |
| [002](01-architecture/adr/002-google-auth-only.md) | Google OAuth only |
| [003](01-architecture/adr/003-work-edition-model.md) | Work/Edition data model |
| [004](01-architecture/adr/004-postgres-fts.md) | PostgreSQL FTS |
| [005](01-architecture/adr/005-multisite-resolution.md) | Multisite via Host |
| [006](01-architecture/adr/006-modular-monolith.md) | Modular monolith |

## Governance

### When to Update Docs

| Event | Update |
|-------|--------|
| Entity added | database.md |
| Endpoint added | api.md |
| Architecture decision | New ADR |
| Migration created | Mention if significant |

### When ADR Required

- Choosing between 2+ valid approaches
- Decision affects multiple modules
- Hard to reverse
- Security implications
