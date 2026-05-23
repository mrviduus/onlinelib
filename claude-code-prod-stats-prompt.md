# Claude Code prompt — collect prod stats for Gemma 4 article

Paste the block below into Claude Code (CLI) inside any local repo. Claude Code will SSH into your prod server, run a small read-only data-collection pass, and report back the numbers we need to drop into the dev.to article before publishing.

**Before pasting:** replace `YOUR_SSH_TARGET` with how you normally SSH into your prod box (e.g. `vasyl@textstack-prod.example.com` or whatever's in `~/.ssh/config`). Replace `/path/to/textstack/on/prod` with the absolute path to the textstack repo on the server (where `docker compose` is run from).

---

```
I'm preparing a Dev.to submission for the Gemma 4 Challenge that needs production stats from my self-hosted TextStack deployment. SSH into my prod server and collect read-only metrics. Do not run any write or destructive commands.

SSH target: YOUR_SSH_TARGET
Working directory on server: /path/to/textstack/on/prod
Database container: textstack_db_prod
Postgres user: read from .env on the server (variable POSTGRES_USER)
Postgres db: read from .env on the server (variable POSTGRES_DB)
Ollama container service name in docker compose: ollama

Run the following, in this order, and report the full output of each step verbatim. If anything errors, paste the error and continue to the next step. All commands are read-only.

STEP 1 — Confirm Ollama is healthy and Gemma 4 is loaded:
  docker compose exec ollama ollama list
  docker compose exec ollama ollama ps
  docker stats --no-stream ollama 2>/dev/null || true

STEP 2 — Container uptime + memory snapshot of the host:
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.RunningFor}}' | head -20
  free -h
  uptime

STEP 3 — Vocabulary table totals (Gemma generates distractors/hint/explanation; null means it didn't run for that word):
  source .env
  docker exec textstack_db_prod psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
    SELECT
      COUNT(*) AS total_words_all_time,
      COUNT(distractors) AS with_distractors_all_time,
      COUNT(hint) AS with_hint_all_time,
      COUNT(explanation) AS with_explanation_all_time
    FROM vocabulary_words;
  "

STEP 4 — Words created since the Gemma swap (PR #232 merged on or around 2026-05-07):
  docker exec textstack_db_prod psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
    SELECT
      COUNT(*) AS total_words_since_swap,
      COUNT(distractors) AS with_distractors_since_swap,
      COUNT(hint) AS with_hint_since_swap,
      COUNT(explanation) AS with_explanation_since_swap,
      MIN(created_at) AS earliest_post_swap_word,
      MAX(created_at) AS latest_post_swap_word,
      ROUND(EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))/3600.0, 1) AS hours_window_post_swap
    FROM vocabulary_words
    WHERE created_at >= '2026-05-07';
  "

STEP 5 — Average distractor count per Gemma-touched word (each distractors value is a JSON array):
  docker exec textstack_db_prod psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
    SELECT
      ROUND(AVG(jsonb_array_length(distractors::jsonb)), 2) AS avg_distractors_per_word,
      MIN(jsonb_array_length(distractors::jsonb)) AS min_distractors,
      MAX(jsonb_array_length(distractors::jsonb)) AS max_distractors
    FROM vocabulary_words
    WHERE distractors IS NOT NULL
      AND created_at >= '2026-05-07';
  "

STEP 6 — Sample 3 real (term, distractors) pairs from after the swap (so I can verify quality and optionally quote one in the article):
  docker exec textstack_db_prod psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
    SELECT
      word,
      LEFT(distractors, 200) AS distractors_preview
    FROM vocabulary_words
    WHERE distractors IS NOT NULL
      AND created_at >= '2026-05-07'
    ORDER BY random()
    LIMIT 3;
  "

STEP 7 — Quick disk + container info for Ollama specifically:
  docker compose exec ollama du -sh /root/.ollama 2>/dev/null || docker compose exec ollama du -sh ~/.ollama 2>/dev/null || echo 'ollama dir size: not accessible via this path'
  docker inspect ollama --format '{{ .HostConfig.Memory }}' 2>/dev/null

When done, summarize at the bottom in this exact format so I can drop it straight into the article:

  REPORT FOR ARTICLE:
  - Words saved since Gemma 4 e4b swap (2026-05-07 → now): N
  - Of those, Gemma-generated distractors: N (X% success rate)
  - Of those, Gemma-generated hints: N
  - Of those, Gemma-generated explanations: N
  - Average distractors per generated word: N.NN
  - Time window since swap: N hours
  - Ollama container uptime: STRING
  - Gemma 4 e4b model resident: YES/NO (from `ollama ps`)
  - One example (term, distractors) pair worth quoting: <quoted from STEP 6 output>

Do not commit, push, or modify any file on the server. Read-only only. If you need a sudo password for any command, stop and ask me — none of these commands should require sudo.
```

---

## What to do with the output

When Claude Code reports back, look for two numbers:

1. **`with_distractors_since_swap`** — the count of real Gemma calls that successfully generated 5 distractors. This replaces the placeholder *"~3 hours of real distractor calls"* in the article body.
2. **The example (term, distractors) pair** from STEP 6 — pick one with a clearly technical term and 5 sensible distractors, and add it to the article as a real-data block right under the parser-bug section. It will land harder than the synthetic `linearizability` example (which we keep, because it pre-dates having real production data).

If `with_distractors_since_swap` is < 10, the article framing stays as-is ("dataset starts fresh from yesterday"). If it's 50+, change the "What's next" closing paragraph to mention the actual count instead of "~1000 needed for fine-tuning, dataset starts fresh".

If Ollama container uptime is < 24h or `ollama ps` shows nothing resident, you have a current problem on prod — the silent fallback might be back. Worth investigating before publishing the post (we don't want a reader to land, click into textstack.app, and find vocab features broken).
