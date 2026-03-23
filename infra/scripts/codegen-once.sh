#!/bin/bash
set -euo pipefail

DESCRIPTION="$1"
PROGRESS_FILE="${2:-/dev/null}"
JOB_ID="$3"

if [ -z "$DESCRIPTION" ] || [ -z "$JOB_ID" ]; then
  echo "Usage: $0 <description> <progress-file> <job-short-id>"
  exit 1
fi

PLAN_FILE="docs/05-features/codegen-${JOB_ID}.md"
TIMEOUT=1800  # 30 min per iteration

timeout "$TIMEOUT" claude -p --permission-mode acceptEdits \
  "You are working on the TextStack project.
Task: $DESCRIPTION

Read @CLAUDE.md for project context.

PLAN FILE: $PLAN_FILE
If $PLAN_FILE does not exist, your FIRST action is to create it as a PDD (Product Design Doc):
- Follow the format of existing docs/05-features/feat-*.md files
- Include: Status (In Progress), Goal, Non-goals, Plan (broken into slices), Files to Change, Verification
- Then implement Slice 1

If $PLAN_FILE exists, read it to understand the full plan and what slices are done.

Read the progress file at $PROGRESS_FILE to see what was already done.
Implement the next incomplete slice from the plan.

After implementing:
1. Run type checks (dotnet build or pnpm -C apps/web tsc --noEmit as appropriate).
2. Commit your changes with a descriptive message.
3. Append what you did to $PROGRESS_FILE.
4. Update $PLAN_FILE — mark completed slices, update Status if all done.

ONLY DO ONE SLICE AT A TIME.
If ALL slices are complete, set Status to Completed in $PLAN_FILE and output CODEGEN_COMPLETE."
