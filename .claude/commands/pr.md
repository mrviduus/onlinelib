---
description: Create a PR with title, description, rollback plan, and auto-append to CHANGELOG.md. Detects slice number from branch/commits.
argument-hint: (no args) or '<slice-number>' to override detection
allowed-tools: Bash, Read, Edit, Grep, Glob
---

# /pr — create PR + update changelog

End-of-slice ritual: commit any pending changes, build PR description, append changelog entry, push, open PR.

## Pre-conditions

Before starting:
1. `/check` should be green. If not run yet, ask user to run it first. If user insists on skipping, proceed but warn in PR description.
2. Working tree should have all intended changes staged or committed.

## Step 1 — Detect context

```bash
BASE=$(git merge-base HEAD origin/main 2>/dev/null || echo "HEAD~5")
git log --oneline ${BASE}..HEAD                  # commits in this PR
git diff --stat ${BASE}..HEAD                    # change scope
git branch --show-current                        # branch name
git status --short                               # any uncommitted?
```

**Detect slice number:** look at commit messages for `my-books-v2 [NN]:` pattern. If `$ARGUMENTS` provided, use that. If neither — ask user.

**Detect scope category** for changelog grouping (one of: `Library`, `Reader`, `Vocabulary`, `Mobile`, `Backend`, `Admin`, `Infra`, `Other`) by looking at most-touched paths.

## Step 2 — Read slice brief (if applicable)

If slice number detected, read `docs/ux-roadmap/<NN>-*.md` to extract:
- Slice title
- Goal (one sentence)
- Rollback plan
- Feature flag name (if any)

This makes the PR description self-documenting.

## Step 3 — Build PR title

Format: `my-books-v2 [<NN>]: <slice-title>`

Examples (from existing commits):
- `my-books-v2 [01]: persistent header upload button`
- `my-books-v2 slice 02: drag-drop anywhere on web`

Keep under 72 chars. If non-slice work, use plain conventional style: `fix(library): ...` or `feat(reader): ...`.

## Step 4 — Build PR body

Use this template (HEREDOC):

```markdown
## Summary

<1–2 sentences from slice Goal>

## Slice

`docs/ux-roadmap/<NN>-<slug>.md` — Phase <X>

## Changes

- <bullet per significant change, grouped by area>
- <e.g. "Added `<UploadButton />` to Header.tsx, auth-gated">
- <e.g. "New endpoint `POST /me/books/{id}/finished`">

## Tests

- Unit: <list of new/changed test files>
- Integration: <if any>
- E2E: <if any>

## Rollback plan

<one-liner from slice brief, or commit revert if no flag>

## Notes

<anything reviewer should know — gotchas, follow-ups, open questions>
```

## Step 5 — Append to CHANGELOG.md

**This is the part you must NEVER skip.**

Read current `CHANGELOG.md`. Locate the `## [Unreleased]` section. Determine target subsection:

- If a subsection `### My Books v2 — UX (YYYY-MM-DD)` exists for **today's date** under `[Unreleased]`, append a bullet to it.
- Otherwise, create a new subsection at the **top of `[Unreleased]`** (right under the heading).

Bullet format — blog-publishable, one line:

```markdown
- **<Feature name>** ([`<short-sha>`](https://github.com/<repo>/commit/<sha>)) — <one-sentence what + one-sentence why-it-matters>. <Optional: behind flag `<flag.name>`.>
```

Real example for slice 01:
```markdown
- **Persistent upload button in header** ([`28a377c`](https://github.com/.../commit/28a377c)) — `+` upload button now lives in the main header on every page; Cmd+U opens from anywhere. Cuts upload from 4 clicks to 1. Behind flag `myBooksV2.uploadButton`.
```

If multiple commits in this PR, mention the PR number once it's created (placeholder `#TBD`, then update). Or use the merge commit SHA after PR is merged — out of scope of this command.

**Date inside subsection** uses ISO format: `2026-04-26`. Get via `date +%Y-%m-%d`.

**Use `Edit` tool** with `old_string` matching existing `## [Unreleased]` line (exact match including newline) and `new_string` being the same line + your new subsection block.

## Step 6 — Commit changelog

If you edited CHANGELOG.md as part of this command (and it wasn't already committed):

```bash
git add CHANGELOG.md
git commit -m "changelog: my-books-v2 [<NN>] <slice-title>"
```

This commit goes on top of the slice's other commits. Reviewer sees the changelog update as a separate commit — easy to verify.

## Step 7 — Push and create PR

```bash
git push -u origin $(git branch --show-current)

gh pr create \
  --title "<title from step 3>" \
  --body "$(cat <<'EOF'
<body from step 4>
EOF
)"
```

If PR already exists for this branch (`gh pr view` returns one), update title/body instead of creating new:
```bash
gh pr edit --title "..." --body "..."
```

## Step 8 — Output to user

Report:

```
PR opened: <url>
Title: <title>
Changelog: appended to ## [Unreleased] / ### My Books v2 — UX (YYYY-MM-DD)

Next steps:
- Request review (or self-review the diff one more time).
- After merge, mark slice <NN> done in docs/ux-roadmap/README.md (single edit, take 10 seconds).
```

## Failure modes — handle gracefully

- `gh` not authenticated → tell user to run `gh auth login`, do NOT auto-handle.
- Push rejected (non-fast-forward) → STOP. Show user the conflict, do not force-push.
- CHANGELOG.md edit conflict (file changed between read and edit) → re-read and retry once. If still conflicts → ask user.
