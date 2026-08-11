---
description: Append a changelog entry outside the /pr flow. Enforces the one-line format and routes the write-up to the archive, an incident postmortem, or an ADR.
argument-hint: <Area>: <one-line description>  e.g. "Reader: fix highlight pulse for list view"
allowed-tools: Bash, Read, Edit, Write
---

# /changelog — manual entry

For when an entry must land outside the slice/PR flow: a hotfix straight to main, a dependency bump,
a refactor too small for its own subsection, a backport, or a `/pr` you skipped.

## Step 0 — Decide where it goes (do this first)

The changelog is four files, and putting a thing in the wrong one is how the old 1804-line file
happened. Route before you write:

| What happened | Where it goes |
|---|---|
| Any merged change | **One line** in `CHANGELOG.md` — always |
| It needs more than one line to explain | Full write-up in `docs/changelog-archive/<YYYY>-H<1\|2>.md`, linked from that line |
| It broke production | Postmortem in `docs/incidents/` (copy `_TEMPLATE.md`), linked from that line |
| It changed a load-bearing decision | ADR in `docs/01-architecture/adr/` |
| It finished, or created, open work | Update `docs/STATUS.md` too |

A dependency bump is one line and nothing else. An incident is one line **plus** a postmortem. Most
features are one line plus an archive entry.

## Step 1 — Parse arguments

Expected: `<Area>: <description>` or `<Area> — <description>`. Without a separator, ask to rephrase.

Areas: `Reader`, `Library`, `Vocabulary`, `Book Chat`, `Mobile`, `Users`, `Admin`, `SEO`,
`Observability`, `Ops`, `Worker`, `AI quality`, `Extraction`, `Infra`, `Docs`.

## Step 2 — Write the line

Read `CHANGELOG.md`, find `## [Unreleased]`. Today: `date +%Y-%m-%d`.

```markdown
- **<Area>** — <what changed, one clause> — <scope> · [details](docs/changelog-archive/<YYYY>-H<N>.md#<anchor>)
```

`<scope>` is `backend`, `web`, `mobile`, `infra`, or a combination. Add
`· [**postmortem**](docs/incidents/<file>.md)` **before** the details link when one exists. Omit the
details link entirely if there is no write-up — never create an empty archive section just to link at it.

**One line.** If you are reaching for a second sentence, that sentence belongs in the archive.

If `[Unreleased]` currently says `_Nothing yet._`, replace that line with your entry.

## Step 3 — Write the archive entry (unless it's a one-liner)

Append at the **top** of `docs/changelog-archive/<YYYY>-H<1|2>.md` (H1 = Jan–Jun, H2 = Jul–Dec):

```markdown
<a id="<anchor>"></a>

## <the line text, without links> — YYYY-MM-DD

<the full write-up>
```

`<anchor>` = `YYYY-MM-DD-` + heading lowercased, non-alphanumerics collapsed to `-`, cut to 60 chars.
It must match the link in `CHANGELOG.md` exactly.

Write the archive entry as fully as the work deserves — root cause, what was ruled out, what it cost,
what the misleading evidence looked like. **This is the article source material.** Nothing about the
restructure asks for less detail; it asks for the detail to live one click away from the index.

## Step 4 — Commit context

```bash
git log -1 --format="%h %s"
```

If a recent commit matches the description, reference its short SHA in the archive entry (not in the
one-line index — that line is for humans scanning, not for SHAs).

## Step 5 — Show the diff

```bash
git diff CHANGELOG.md docs/changelog-archive docs/incidents docs/STATUS.md
```

Verify the anchor link resolves: the `<a id="...">` in the archive must equal the `#...` in the line.

## Step 6 — Optionally commit

Ask: "Commit this changelog entry now? (y/n)". If yes:

```bash
git add CHANGELOG.md docs/changelog-archive docs/incidents docs/STATUS.md
git commit -m "changelog: <area> — <short description>"
```

## Examples

```
/changelog Infra: bump pdfpig to 0.1.14
→ One line under [Unreleased]. No archive entry, no details link. Done.

/changelog Reader: fix highlight pulse for list view
→ One line + a short archive entry explaining what was wrong.

/changelog Ops: nightly backup filled the disk
→ One line + docs/incidents/YYYY-MM-DD-*.md from _TEMPLATE.md + a row in incidents/README.md,
  and the line carries a [**postmortem**] link.
```
