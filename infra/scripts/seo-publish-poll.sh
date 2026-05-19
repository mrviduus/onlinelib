#!/bin/bash
# Polls DB for auto-publish jobs and processes them.
# Generates SEO content via Claude CLI, then publishes editions.
# Requires: claude CLI (Max subscription), docker (for psql via db container).
# Usage: ./infra/scripts/seo-publish-poll.sh
# Run via: systemd, tmux, or screen.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
POLL_INTERVAL=60

# Status codes (match AutoPublishJobStatus enum)
STATUS_QUEUED=0
STATUS_RUNNING=1
STATUS_GENERATING_SEO=2
STATUS_AWAITING_REVIEW=3
STATUS_PUBLISHING=4
STATUS_COMPLETED=5
STATUS_FAILED=6

# Load .env. Validate first — see seo-generate.sh for the full story; tl;dr
# `KEY = value` with whitespace around `=` makes bash run KEY as a command,
# `set -e` kills the script, and the failure mode is invisible.
if [ -f "$REPO_DIR/.env" ]; then
  bad_lines=$(grep -nE '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]+=|^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*=[[:space:]]' "$REPO_DIR/.env" || true)
  if [ -n "$bad_lines" ]; then
    echo "ERROR: $REPO_DIR/.env has KEY = VALUE with whitespace around '=' — bash source will fail. Fix these lines:" >&2
    echo "$bad_lines" | sed 's/=.*/=<redacted>/' >&2
    exit 1
  fi
  set -a
  source "$REPO_DIR/.env"
  set +a
fi

for var in POSTGRES_USER POSTGRES_DB; do
  if [ -z "${!var:-}" ]; then
    echo "ERROR: $var not set. Check .env file." >&2
    exit 1
  fi
done

# Add claude CLI to PATH
for claude_dir in "$HOME"/.vscode/extensions/anthropic.claude-code-*/resources/native-binary; do
  [ -d "$claude_dir" ] && export PATH="$claude_dir:$PATH" && break
done

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# Don't swallow psql stderr — see infra/scripts/seo-generate.sh for the
# same rewrite. A 3-week silent column-rename outage taught us the cost
# of `2>/dev/null` on the data-layer helpers.
db_query() {
  docker compose -f "$REPO_DIR/docker-compose.yml" exec -T db \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1"
}

db_exec() {
  docker compose -f "$REPO_DIR/docker-compose.yml" exec -T db \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"
}

# db_query already returns one row from psql -tAc; piping through `head -1`
# closes the pipe early and triggers SIGPIPE on multi-line values, which
# `set -o pipefail` then turns into a non-zero pipeline exit and `set -e`
# kills the script. Drop the head; rely on the SQL itself returning one row.
get_setting() {
  local key="$1" default="$2"
  local val
  val=$(db_query "SELECT value FROM admin_settings WHERE key='$key'")
  echo "${val:-$default}"
}

get_job_field() {
  local job_id="$1" field="$2"
  db_query "SELECT $field FROM auto_publish_jobs WHERE id = '$job_id'"
}

update_job() {
  local job_id="$1"
  shift
  db_exec "UPDATE auto_publish_jobs SET $* WHERE id = '$job_id';" >/dev/null 2>&1
}

# Backstop for job failures: process_job already records detailed errors on
# every code path it controls. This only kicks in when process_job died
# unexpectedly (e.g. set -e on an early db_query) before writing terminal
# status — leaving the row in RUNNING/GENERATING_SEO with no error. The
# previous version unconditionally overwrote whatever process_job set with
# the literal string 'Script failed', erasing the diagnostic.
finalize_failed_job() {
  local job_id="$1"
  db_exec "UPDATE auto_publish_jobs
    SET status = $STATUS_FAILED,
        error = COALESCE(NULLIF(error, ''), 'Script exited unexpectedly'),
        finished_at = COALESCE(finished_at, NOW())
    WHERE id = '$job_id'
      AND status NOT IN ($STATUS_COMPLETED, $STATUS_FAILED, $STATUS_AWAITING_REVIEW);" >/dev/null 2>&1
}

check_edition_seo_ready() {
  local edition_id="$1"
  db_query "SELECT CASE
    WHEN description IS NOT NULL AND description != ''
    AND seo_relevance_text IS NOT NULL AND seo_relevance_text != ''
    AND seo_themes_json IS NOT NULL AND seo_themes_json != ''
    AND seo_faqs_json IS NOT NULL AND seo_faqs_json != ''
    THEN 'yes' ELSE 'no' END
    FROM editions WHERE id='$edition_id'"
}

check_author_seo_ready() {
  local author_id="$1"
  db_query "SELECT CASE
    WHEN bio IS NOT NULL AND bio != ''
    AND seo_relevance_text IS NOT NULL AND seo_relevance_text != ''
    AND seo_themes_json IS NOT NULL AND seo_themes_json != ''
    AND seo_faqs_json IS NOT NULL AND seo_faqs_json != ''
    THEN 'yes' ELSE 'no' END
    FROM authors WHERE id='$author_id'"
}

auto_create_job() {
  local lang_filter="$1"
  local lang_clause=""
  if [ -n "$lang_filter" ]; then
    lang_clause="AND e.language = '$lang_filter'"
  fi

  # Circuit breaker: skip editions that already failed >= 5 times in the
  # last 24h. Without this, one bad edition (e.g. SIGPIPE on its excerpt)
  # gets re-picked every minute, burns the daily quota on retries, and
  # blocks healthy candidates. Failed jobs (status=6) are otherwise
  # invisible to the NOT EXISTS clause, so a repeatedly-failing edition
  # was an infinite candidate.
  local edition_id
  edition_id=$(db_query "SELECT e.id FROM editions e
    WHERE e.status = 0
    AND e.cover_path IS NOT NULL AND e.cover_path != ''
    AND EXISTS(SELECT 1 FROM chapters c WHERE c.edition_id = e.id)
    AND NOT EXISTS(SELECT 1 FROM auto_publish_jobs j
      WHERE j.edition_id = e.id AND j.status IN (0,1,2,3,4,5))
    AND (SELECT COUNT(*) FROM auto_publish_jobs j2
      WHERE j2.edition_id = e.id
      AND j2.status = $STATUS_FAILED
      AND j2.created_at > NOW() - INTERVAL '24 hours') < 5
    $lang_clause
    ORDER BY e.created_at ASC LIMIT 1")

  if [ -z "$edition_id" ]; then
    return 1
  fi

  local site_id="11111111-1111-1111-1111-111111111111"
  local job_id
  job_id=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen | tr '[:upper:]' '[:lower:]')

  db_exec "INSERT INTO auto_publish_jobs (id, site_id, edition_id, status, generated_edition_seo, generated_author_seo, priority, created_at)
    VALUES ('$job_id', '$site_id', '$edition_id', $STATUS_QUEUED, false, false, false, NOW());" >/dev/null 2>&1

  echo "$job_id"
}

process_job() {
  local job_id="$1"

  [[ "$job_id" =~ ^[0-9a-f-]{36}$ ]] || { log "Invalid job ID: $job_id"; return 1; }

  local edition_id
  edition_id=$(get_job_field "$job_id" "edition_id")

  local title
  title=$(db_query "SELECT title FROM editions WHERE id='$edition_id'")
  log "Processing job $job_id: $title"

  update_job "$job_id" "status = $STATUS_RUNNING, started_at = NOW()"

  # Step 1: Edition SEO
  local seo_ready
  seo_ready=$(check_edition_seo_ready "$edition_id")

  if [ "$seo_ready" = "no" ]; then
    update_job "$job_id" "status = $STATUS_GENERATING_SEO"
    log "Generating edition SEO for: $title"

    local seo_output
    if seo_output=$(bash "$REPO_DIR/infra/scripts/seo-generate.sh" edition "$edition_id" 2>&1); then
      local truncated
      truncated=$(echo "$seo_output" | tail -c 10000 | sed "s/'/''/g")
      update_job "$job_id" "generated_edition_seo = true, log_output = '$truncated'"
      log "Edition SEO generated"
    else
      local err
      err=$(echo "$seo_output" | tail -c 1000 | sed "s/'/''/g")
      update_job "$job_id" "status = $STATUS_FAILED, error = 'Edition SEO failed: $err', finished_at = NOW()"
      log "ERROR: Edition SEO generation failed"
      return 1
    fi
  fi

  # Step 2: Author SEO
  local author_ids
  author_ids=$(db_query "SELECT author_id FROM edition_authors WHERE edition_id='$edition_id'")

  for author_id in $author_ids; do
    author_id=$(echo "$author_id" | tr -d '[:space:]')
    [ -z "$author_id" ] && continue

    local author_ready
    author_ready=$(check_author_seo_ready "$author_id")

    if [ "$author_ready" = "no" ]; then
      log "Generating author SEO for author $author_id"

      local author_output
      if author_output=$(bash "$REPO_DIR/infra/scripts/seo-generate.sh" author "$author_id" 2>&1); then
        update_job "$job_id" "generated_author_seo = true"
        log "Author SEO generated"
      else
        local err
        err=$(echo "$author_output" | tail -c 500 | sed "s/'/''/g")
        update_job "$job_id" "status = $STATUS_FAILED, error = 'Author SEO failed ($author_id): $err', finished_at = NOW()"
        log "ERROR: Author SEO generation failed for $author_id"
        return 1
      fi
    fi
  done

  # Step 3: Review gate
  local require_review
  require_review=$(get_setting "autopublish.requireReview" "false")

  if [ "$require_review" = "true" ]; then
    update_job "$job_id" "status = $STATUS_AWAITING_REVIEW"
    log "Job $job_id awaiting review: $title"
    return 0
  fi

  # Step 4: Publish via internal endpoint
  update_job "$job_id" "status = $STATUS_PUBLISHING"
  log "Publishing edition: $title"

  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "http://localhost:8080/internal/editions/$edition_id/publish") || {
    update_job "$job_id" "status = $STATUS_FAILED, error = 'Publish curl failed', finished_at = NOW()"
    return 1
  }

  if [ "$http_code" != "200" ]; then
    update_job "$job_id" "status = $STATUS_FAILED, error = 'Publish returned HTTP $http_code', finished_at = NOW()"
    log "ERROR: Publish returned HTTP $http_code"
    return 1
  fi

  update_job "$job_id" "status = $STATUS_COMPLETED, finished_at = NOW()"
  log "Published: $title"
}

# Main loop
log "SEO Auto-Publish poller started (repo: $REPO_DIR)"
while true; do
  # Check enabled
  enabled=$(get_setting "autopublish.enabled" "false")
  if [ "$enabled" != "true" ]; then
    sleep "$POLL_INTERVAL"
    continue
  fi

  # Check hour
  configured_hour=$(get_setting "autopublish.hourUtc" "10")
  current_hour=$(date -u +%-H)
  if [ "$current_hour" != "$configured_hour" ]; then
    # Still process manually queued (priority) jobs regardless of hour
    priority_job=$(db_query "SELECT id FROM auto_publish_jobs WHERE status = $STATUS_QUEUED AND priority = true ORDER BY created_at LIMIT 1" | tr -d '[:space:]')
    if [ -n "$priority_job" ]; then
      process_job "$priority_job" || {
        log "Priority job $priority_job failed"
        # process_job sets a detailed error on all its own failure paths; only
        # backstop with the generic 'Script failed' when it died early
        # without recording terminal state (status still RUNNING).
        finalize_failed_job "$priority_job"
      }
    fi
    sleep "$POLL_INTERVAL"
    continue
  fi

  # Check daily quota
  books_per_day=$(get_setting "autopublish.booksPerDay" "1")
  today_count=$(db_query "SELECT COUNT(*) FROM auto_publish_jobs WHERE status = $STATUS_COMPLETED AND finished_at >= CURRENT_DATE" | tr -d '[:space:]')
  if [ "$today_count" -ge "$books_per_day" ]; then
    sleep "$POLL_INTERVAL"
    continue
  fi

  # Get next job (priority first, then FIFO)
  job_id=$(db_query "SELECT id FROM auto_publish_jobs WHERE status = $STATUS_QUEUED ORDER BY priority DESC, created_at ASC LIMIT 1" | tr -d '[:space:]')

  if [ -z "$job_id" ]; then
    # Auto-create from candidates
    lang_filter=$(get_setting "autopublish.language" "")
    job_id=$(auto_create_job "$lang_filter") || {
      sleep "$POLL_INTERVAL"
      continue
    }
  fi

  if [ -n "$job_id" ]; then
    process_job "$job_id" || {
      log "Job $job_id failed"
      finalize_failed_job "$job_id"
    }
  fi

  sleep "$POLL_INTERVAL"
done
