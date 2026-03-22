# CodeGen — AI Code Generation (Ralph Loop)

## Status
Implemented

## Overview

Admin panel feature: describe a task → Claude Code implements it in an iterative loop → creates PR.

Uses Claude Code CLI with Max subscription (OAuth auth on host machine).

## Flow

```
1. Admin UI: describe task + set max iterations → Create Job (Queued)
2. Admin clicks Start → status = Running
3. Host poller (codegen-poll.sh) picks up Running job
4. Iteration 1: Claude creates PDD in docs/05-features/codegen-{id}.md
5. Iterations 2..N: Claude reads PDD + progress → implements next slice
6. Final: git push → gh pr create → job = Completed
7. PDD stays in repo as feature documentation
```

## Architecture

```
Admin UI (CodeGenPage.tsx)
    │
    ▼
API (AdminCodeGenEndpoints.cs) → DB (code_gen_jobs table)
    │
    ▼
codegen-poll.sh (host, polls DB every 10s)
    │
    ▼
codegen-once.sh (single Claude Code iteration)
    │
    ▼
Claude Code CLI (Max subscription, OAuth)
    │
    ▼
git push + gh pr create
```

## Components

| Component | Path | Purpose |
|-----------|------|---------|
| Entity | `backend/src/Domain/Entities/CodeGenJob.cs` | Job state |
| Enum | `backend/src/Domain/Enums/CodeGenJobStatus.cs` | Queued/Running/Completed/Failed/Cancelled |
| API | `backend/src/Api/Endpoints/AdminCodeGenEndpoints.cs` | CRUD + start/cancel |
| Admin UI | `apps/admin/src/pages/CodeGenPage.tsx` | Create/monitor jobs |
| Poller | `infra/scripts/codegen-poll.sh` | Host-side DB poller |
| Runner | `infra/scripts/codegen-once.sh` | Single Claude iteration |

## PDD (Product Design Doc)

Each CodeGen job creates a PDD at `docs/05-features/codegen-{first8chars}.md`.

- **Created**: iteration 1 (Claude generates plan from task description)
- **Updated**: each iteration (Claude marks completed slices)
- **Lifecycle**: stays in repo after PR merge as feature documentation
- **Cancelled jobs**: PDD stays on branch, never merged

Format follows existing `docs/05-features/feat-*.md` convention.

## API Endpoints

```
POST   /admin/codegen/jobs              # Create job
GET    /admin/codegen/jobs              # List jobs
GET    /admin/codegen/jobs/{id}         # Job detail + log output
POST   /admin/codegen/jobs/{id}/start   # Start (Queued → Running)
POST   /admin/codegen/jobs/{id}/cancel  # Cancel
```

## Running the Poller

Poller runs as a systemd user service — auto-starts on boot, restarts on failure.

```bash
# First-time setup (on server):
make codegen-setup

# Management:
make codegen-status    # Check if running
make codegen-logs      # Tail logs
make codegen-restart   # Restart after manual changes
make codegen-stop      # Stop poller

# Auto-restarts on `make deploy`
```

Systemd unit: `infra/systemd/codegen-poller.service`

## Prerequisites

- Claude Code CLI installed and authenticated (Max subscription)
- `gh` CLI authenticated with repo access
- Docker running (poller uses `docker compose exec db psql`)
- `.env` file with `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
