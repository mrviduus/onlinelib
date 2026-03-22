#!/bin/bash
set -e

DESCRIPTION="$1"
PROGRESS_FILE="$2"

if [ -z "$DESCRIPTION" ]; then
  echo "Usage: $0 <description> <progress-file>"
  exit 1
fi

claude -p --permission-mode acceptEdits \
  "You are working on the TextStack project.
Task: $DESCRIPTION

Read @CLAUDE.md for project context.

1. Read the progress file at $PROGRESS_FILE to see what was already done.
2. Find the next incomplete part of the task and implement it.
3. Run type checks (dotnet build or pnpm -C apps/web tsc --noEmit as appropriate).
4. Commit your changes with a descriptive message.
5. Append what you did to $PROGRESS_FILE.

ONLY DO ONE TASK AT A TIME.
If the task is fully complete, output CODEGEN_COMPLETE."
