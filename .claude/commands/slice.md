---
description: Start work on an AI-portfolio PR slice (AI-0xx) from PLAYBOOK-ai-portfolio.md. Locates the task, plans it, confirms, then implements as a small PR.
argument-hint: <AI-number> e.g. AI-040 (or 040 / 40)
allowed-tools: Read, Glob, Grep, Bash
---

# /slice — start an AI-portfolio PR slice

Start work on slice `$ARGUMENTS` from `PLAYBOOK-ai-portfolio.md` (the AI-0xx roadmap).

## Step 1 — Locate the task

Normalize `$ARGUMENTS` to `AI-0NN` (accept `AI-040`, `040`, `40`). In `PLAYBOOK-ai-portfolio.md`, find the `| AI-0NN | … |` row (under a phase's `### Tasks (PRs)` table).

- If not found: list the open tasks of the **current phase** (the earliest phase with un-merged AI-0xx items) and stop.
- If `$ARGUMENTS` is empty: report which phase we're in and the next 🔲 task, and ask which to start.

## Step 2 — Read the context

Read, in order:
1. `CLAUDE.md` — stack, layering, conventions (skim if already in context).
2. The task's **`## Phase N`** section in the playbook — Scope (in/out), Architecture additions, Data model, API surface, Eval criteria, **Definition of done**.
3. `CHANGELOG.md` top — the house style + what already shipped in this phase.

Check whether the task is already merged: `git log --oneline -20 | grep -i "AI-0NN"`. If merged, say so and stop.

## Step 3 — Pre-flight

```bash
git status --short            # working tree clean?
git branch --show-current     # expect main
git log --oneline -3
```

If the tree is dirty, **stop and ask**. If a previous slice's branch is still checked out, sync main first.

## Step 4 — Plan + confirm (3-role lens)

Output a concise plan (architect + dev + qa):

```
AI-0NN — <title>   [Phase N]
Goal: <one line>

Approach:
- <key seam/files; reuse before adding>
- <data-model / migration impact, if any>

Out of scope: <what this PR does NOT do>

Tests: <unit / aievals(fake-driven) / integration(skip-friendly)>
DoD touched: <eval gate / metric, if any>

Open questions: <terse; sacrifice grammar>
```

If the playbook estimate is ≥1.5d or the change spans web+backend+mobile, **propose splitting into a/b slices**. WAIT for the user to reply `go` (or answer questions). Do not implement before confirmation.

## Step 5 — Implement (our conventions)

- **Branch first**: `git checkout main && git pull && git checkout -b ai-0NN-<short-kebab>`. Never commit on `main`.
- Smallest change that fits existing patterns; reuse the named seam. Match surrounding code's idiom/comment density.
- **Always update `CHANGELOG.md`** under `## [Unreleased]` (the owner writes an article from it).
- Code-only PRs — exclude untracked planning docs (`ARCH-*`, `PLAYBOOK-*`, `ROADMAP-*`, `docs/blog/`).
- Commit: `feat(<scope>): <summary> (AI-0NN)` (or `fix`/`refactor`/`ci`), body explaining the why, ending with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Step 6 — Verify + ship

1. `/check` — build + tests + `dotnet format --verify-no-changes` (+ web `tsc`/build if FE touched).
2. `/pr` — open the PR, **wait for CI by head-SHA**, never merge red. After 5/5 green, squash-merge + delete branch + sync main.
3. If the eval gate must run on prod (key + corpus), say so — that's owner-triggered, not CI.

Deploy is automatic on merge to `main` **via GitHub Actions only** — never deploy manually.
