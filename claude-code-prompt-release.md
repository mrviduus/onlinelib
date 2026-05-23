# Claude Code prompt — cut v0.1.0 release

Copy the prompt below and paste it into Claude Code (`claude` CLI) running in the textstack repo root. It will execute end-to-end: pre-flight checks → CHANGELOG update → tag creation → push → GitHub Release.

---

## Prerequisites

Before running the prompt, verify in your terminal:

1. `gh` CLI installed and authenticated:
   ```bash
   gh auth status
   ```
   Should show `Logged in to github.com as mrviduus`. If not, run `gh auth login`.

2. You have push access to the repo (you do — you're the owner).

3. `release-notes-v0.1.0.md` exists in the repo root (it does — I just created it).

---

## The prompt

````
You are working in the textstack repository at /Users/vasylvdovychenko/projects/textstack/textstack. The owner is Vasyl Vdovychenko.

TASK: Cut and publish the first tagged release v0.1.0 on GitHub.

CONTEXT:
- TextStack was just relicensed from BUSL-1.1 to AGPL-3.0 (PR #201, already merged to main).
- This is the first ever tagged release.
- Goal 1: start the 4-month seasoning timer required by awesome-selfhosted.
- Goal 2: publish a discoverable release (RSS feed, GitHub Releases page).
- A pre-written release notes file exists at release-notes-v0.1.0.md in the repo root — use it as-is for the GitHub Release body.

PRE-FLIGHT CHECKS — halt and report if any fails:

1. Working tree state:
   git status
   If there are uncommitted changes on the current branch, halt. Tell the user to commit or stash before proceeding. Do not stash automatically.

2. Current branch is recorded — we'll need to switch back at the end:
   git rev-parse --abbrev-ref HEAD
   Save this value as ORIGINAL_BRANCH.

3. Switch to main and pull latest:
   git checkout main
   git fetch origin
   git pull origin main --ff-only
   If the pull fails (non-fast-forward), halt and tell the user to resolve manually.

4. Verify the relicense commit is in main:
   git log --oneline -50 | grep -i "relicense from BUSL"
   Should find the AGPL relicense commit. If not found, halt.

5. Verify no v0.1.0 tag already exists:
   git tag -l "v0.1.0"
   Should output nothing. If the tag exists, halt.

6. Verify release-notes-v0.1.0.md exists and is non-empty:
   wc -l release-notes-v0.1.0.md
   Should report at least 50 lines.

7. Verify gh CLI is authenticated:
   gh auth status
   Should show authenticated as mrviduus.

EXECUTE:

1. Update CHANGELOG.md to mark the v0.1.0 release.

   Read the current CHANGELOG.md. Find the line `## [Unreleased]`. Replace that single line with two lines:

   ## [Unreleased]

   ## [v0.1.0] — TODAY_DATE

   Where TODAY_DATE is today's date in YYYY-MM-DD format (use `date +%Y-%m-%d`).

   This convention preserves all existing detailed Unreleased notes under v0.1.0 (so they become the v0.1.0 changelog), and leaves a clean empty Unreleased header at the top for future work.

   Also append a short headline summary near the top of the new v0.1.0 section, immediately after the date header:

   ### Headline

   First tagged release of TextStack under **GNU Affero General Public License v3.0**. Earlier development was BUSL-1.1; v0.1.0 onwards is AGPL-3.0 (PR #201). See `release-notes-v0.1.0.md` for the user-facing announcement.

2. Stage and commit the CHANGELOG update:
   git add CHANGELOG.md
   git commit -m "docs(changelog): mark v0.1.0 release"

3. Push the commit:
   git push origin main

4. Create the annotated tag at HEAD of main:
   git tag -a v0.1.0 -m "v0.1.0 — first AGPL-3.0 release

   First public tagged release of TextStack. Project relicensed from
   BUSL-1.1 to AGPL-3.0 (PR #201). See release-notes-v0.1.0.md and
   CHANGELOG.md for details."

5. Push the tag:
   git push origin v0.1.0

6. Create the GitHub Release using the existing release notes file:
   gh release create v0.1.0 \
     --title "v0.1.0 — First AGPL-3.0 release" \
     --notes-file release-notes-v0.1.0.md \
     --latest

   If the command fails because gh is not installed or not authenticated, report the error and stop.

7. Switch back to ORIGINAL_BRANCH (the branch you were on at the start):
   git checkout $ORIGINAL_BRANCH

VERIFICATION:

After everything completes:

- gh release view v0.1.0 — should print the new release info with the URL
- git tag -l "v0.1.0" — should show the tag
- git log v0.1.0 --oneline -1 — should show the commit the tag points to

OUTPUT a final summary to the user containing:
- Original branch you returned them to
- Tag SHA (full and short)
- CHANGELOG commit SHA
- GitHub Release URL (gh release view v0.1.0 --json url -q .url)
- Confirmation that the 4-month timer for awesome-selfhosted starts today
- Suggested follow-up: edit the GitHub Release on the web to verify formatting, then announce on Twitter/blog/HN

If ANY step fails, do not proceed. Report the failure clearly and propose a recovery action. Never force-push, never delete tags, never rewrite history.
````

---

## After Claude Code finishes

1. **Verify on the web**:
   - Go to https://github.com/mrviduus/textstack/releases
   - Confirm v0.1.0 is published as "Latest" with formatted release notes
   - Confirm the README badge in the release matches AGPL-3.0

2. **Optional polish**:
   - On the GitHub Release page, click "Edit" → upload a screenshot of the reader (drag into the description) for a more visual release page
   - Add a banner image if you have one (`docs/assets/hero.png` would work)

3. **Announce**:
   - Tweet from @Rexetdeus: link to release + 1-line "First AGPL-3.0 release of TextStack — a reader for technical books"
   - Short blog post on vasyl.blog "TextStack v0.1.0 is out, and it's now AGPL-3.0" (this is also the foundation for a HN submission later)

4. **Calendar reminder**: 2026-09-04 — eligible to submit awesome-selfhosted PR

---

## If something goes wrong

- **`gh` not installed**: `brew install gh` then `gh auth login`
- **Push rejected because branch protection**: you might have branch protection on main requiring PRs. If so, the commit + tag flow needs adjustment — let me know and I'll rewrite the prompt to use a PR instead of direct push
- **Tag already exists**: someone else may have tagged. Check with `git tag -l` and decide whether to delete (`git tag -d v0.1.0 && git push origin :refs/tags/v0.1.0`) or use a different version
- **Claude Code halts on a check**: that's working as intended — read the error, fix the underlying issue, re-run
