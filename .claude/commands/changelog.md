---
description: Manually append a changelog entry. Use for fixes, hotfixes, or work that didn't go through /pr. Auto-formatted to match existing CHANGELOG.md style.
argument-hint: <category> <one-line description>  e.g. "Reader: fix highlight pulse for list view"
allowed-tools: Bash, Read, Edit
---

# /changelog — manual entry to CHANGELOG.md

For when an entry needs to land in `CHANGELOG.md` outside the slice/PR flow:
- Hotfix committed straight to main
- Dependency bump
- Refactor that doesn't justify its own subsection
- Backporting from another branch
- Anything that `/pr` would normally handle but you skipped it

## Step 1 — Parse arguments

Expected format: `<category>: <description>` or `<category> — <description>`.

Categories (use existing CHANGELOG.md grouping):
- Library
- Reader
- Vocabulary
- Mobile
- Backend
- Admin
- Infra
- Docs
- Other

If `$ARGUMENTS` doesn't include a colon or dash separator, ask user to rephrase.

## Step 2 — Find or create subsection

Read `CHANGELOG.md`. Locate `## [Unreleased]`. Today's date: `date +%Y-%m-%d`.

Subsection rules:
- If a subsection `### <Category> — <description-prefix> (YYYY-MM-DD)` already exists for today and category — append bullet there.
- Otherwise create a new subsection at top of `[Unreleased]`:
  ```markdown
  ### <Category> (YYYY-MM-DD)
  - <bullet>
  ```
- Match existing punctuation: dash `—` not hyphen, period at end of bullet sentences.

## Step 3 — Get commit context

```bash
git log -1 --format="%h %s"   # latest commit on current branch
```

If a recent commit matches the description (substring), use its SHA in the bullet:

```markdown
- **<Short feature name>** (`<short-sha>`) — <description>.
```

If no matching commit (entry is for unstaged/uncommitted work), omit the SHA — just the bullet text.

## Step 4 — Edit CHANGELOG.md

Use `Edit` tool. `old_string` should be the line `## [Unreleased]\n` (or first existing subsection under it for prepend). Be exact about whitespace.

After edit, show the user the resulting change:

```bash
git diff CHANGELOG.md
```

## Step 5 — Optionally commit

Ask user: "Commit this changelog entry now? (y/n)"

If yes:
```bash
git add CHANGELOG.md
git commit -m "changelog: <category> — <short description>"
```

If no, leave it staged-or-not as the user has it.

## Examples

```
/changelog Reader: fix highlight pulse for list view
→ Adds bullet under ### Reader (2026-04-26) referencing latest commit if matches.

/changelog Infra: bump pdfpig to 0.1.14
→ Adds bullet under ### Infra (2026-04-26).

/changelog Library: continue-reading shelf wheel-scroll passive listener fix
→ Matches commit 6c58795, adds bullet with that SHA under ### Library (2026-04-26).
```
