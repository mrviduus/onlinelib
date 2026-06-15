---
description: Run all relevant tests, lints, and builds for the current changes. Smart-detects scope from git diff.
argument-hint: (no args) or 'full' to force full suite
allowed-tools: Bash, Read, Grep
---

# /check — pre-PR verification

Detect what changed and run only the relevant gates. Mirrors what CI would do, but locally and faster.

## Step 1 — Detect scope

```bash
git diff --name-only origin/main...HEAD 2>/dev/null || git diff --name-only HEAD~1
```

Categorize changed files:

- `apps/web/**` → web tests + build
- `apps/admin/**` → admin build
- `apps/mobile/**` → mobile tsc + e2e
- `backend/src/**` → dotnet test + build
- `tests/**` → run that test project specifically
- `infra/**` or `docker-compose*.yml` → flag for manual smoke (no auto-test)
- `docs/**` only → skip everything, report "docs-only, no checks needed"

If `$ARGUMENTS` is `full`, run everything regardless of detection.

## Step 2 — Run gates in parallel where safe

Run all of these in parallel via separate Bash tool calls (single message, multiple tool uses) — they're independent:

```bash
# Backend (only if backend touched)
dotnet build textstack.sln --nologo -v quiet
dotnet test --nologo -v quiet --filter "FullyQualifiedName!~SlowTests"

# Web (only if web touched)
pnpm -C apps/web typecheck 2>&1 || pnpm -C apps/web exec tsc --noEmit
pnpm -C apps/web test --run
pnpm -C apps/web build

# Admin (only if admin touched)
pnpm -C apps/admin build

# Mobile (only if mobile touched)
cd apps/mobile && npx tsc --noEmit
```

Set `timeout: 300000` (5 min) on each Bash call. If any single command would exceed that, run it without timeout and let it stream.

## Step 3 — Optional E2E

E2E is slow. Run only if the user passed `full` OR if changes touch `apps/web/src/pages/**` or `apps/web/e2e/**`:

```bash
pnpm -C apps/web test:e2e --reporter=line
```

For mobile E2E, similar trigger on `apps/mobile/app/**`.

## Step 4 — Concise summary

Report in this exact format:

```
✅ Backend     dotnet build + test (N tests, Ys)
✅ Web         tsc + vitest + build (M tests, Zs)
⏸️  Admin       not touched, skipped
✅ Mobile      tsc clean
⚠️  E2E         3 of 47 failed — see below

[failed details if any]
[any warnings worth surfacing]

Result: 1 of 5 gates failed. Fix before /pr.
```

If all green: `Result: all gates green. Ready for /pr.`

## Step 5 — On failure

For each failing gate:
1. Show the relevant failing line from output.
2. Suggest most likely cause (missing import, snapshot mismatch, test data, etc.).
3. Do NOT auto-fix. Wait for user direction.

The user runs `/check` to know if they're ready to ship — not to have you start a debugging spiral.
