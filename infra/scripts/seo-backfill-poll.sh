#!/bin/bash
# SEO Backfill Poller — claims queued seo_backfill_jobs via API, generates SEO content
# via Claude CLI, posts result back to API. Runs under systemd.
#
# Responsibility split (unlike seo-publish-poll.sh which talks to DB):
#   * polling + CLI generation — this script
#   * all state writes + business logic — API service (SeoJobProcessor)
#
# Requires: curl, claude CLI on PATH.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
API_URL="${API_URL:-http://localhost:8080}"
POLL_INTERVAL="${SEO_BACKFILL_POLL_INTERVAL:-60}"
JOBS_PER_RUN="${SEO_BACKFILL_JOBS_PER_RUN:-3}"

# Load .env (best-effort — if empty, env vars passed by systemd still apply)
if [ -f "$REPO_DIR/.env" ]; then
  set -a
  source "$REPO_DIR/.env"
  set +a
fi

# Add claude CLI to PATH (same pattern as seo-generate.sh)
for claude_dir in "$HOME"/.vscode/extensions/anthropic.claude-code-*/resources/native-binary; do
  [ -d "$claude_dir" ] && export PATH="$claude_dir:$PATH" && break
done

if ! command -v claude >/dev/null 2>&1; then
  echo "[$(date '+%H:%M:%S')] ERROR: claude CLI not on PATH. Install Claude Code CLI." >&2
  exit 1
fi

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# Check if backfill is enabled via settings endpoint
is_enabled() {
  curl -sS "$API_URL/admin/seo/settings" 2>/dev/null \
    | grep -o '"enabled":true' >/dev/null 2>&1
}

# Claim up to N queued jobs atomically. Returns newline-separated list of job IDs.
claim_jobs() {
  local limit="$1"
  curl -sS -X POST "$API_URL/internal/seo/jobs/claim?limit=$limit" \
    | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' \
    || true
}

# Main loop — dispatches individual jobs to seo-backfill-generate.sh (one subprocess per job).
log "SEO Backfill poller started (API: $API_URL, repo: $REPO_DIR)"
while true; do
  if ! is_enabled; then
    sleep "$POLL_INTERVAL"
    continue
  fi

  claimed=$(claim_jobs "$JOBS_PER_RUN")
  if [ -z "$claimed" ]; then
    sleep "$POLL_INTERVAL"
    continue
  fi

  for job_id in $claimed; do
    log "Dispatching job $job_id"
    bash "$REPO_DIR/infra/scripts/seo-backfill-generate.sh" "$job_id" \
      || log "Job $job_id generate script failed (API should have marked it failed)"
  done

  sleep "$POLL_INTERVAL"
done
