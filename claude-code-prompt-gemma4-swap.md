# Claude Code prompt — swap qwen3:8b → gemma4:e4b

Copy the prompt below and paste it into Claude Code (`claude` CLI) running in the textstack repo root.

## Why this swap

- Current local LLM: `qwen3:8b` (~5-6 GB Q4) — used for distractor generation, hint generation, book metadata, tag suggestions
- New target: `gemma4:e4b` (~3-4 GB Q4) — Google's 2026 Gemma 4 family, "effective 4B" architecture
- Server has 31 GB RAM, Ollama Docker container limited to 4G. Gemma 4 e4b fits comfortably; qwen3:8b was tight against the limit.
- Gemma 4 is on Ollama, confirmed in the host's Ollama app

## Before pasting prompt — quick prerequisites

1. Verify Ollama on the host has `gemma4:e4b`:
   ```bash
   ollama list | grep gemma4
   ```
   If not present:
   ```bash
   ollama pull gemma4:e4b
   ```

2. Make sure repo is clean (`git status` shows nothing to commit) before starting.

---

## The prompt

````
You are working in the textstack repository at /Users/vasylvdovychenko/projects/textstack/textstack.

TASK: Swap the local LLM model used by Ollama from `qwen3:8b` to `gemma4:e4b` across the entire codebase.

CONTEXT:
- TextStack uses Ollama as its local LLM provider. The model is referenced as `Ollama:Model` config value across appsettings.json files, source-code defaults, docker-compose env, and documentation.
- The new model is `gemma4:e4b` (Google's Gemma 4 effective-4B variant, ~3-4 GB Q4 RAM, on Ollama).
- Architecture: `ILlmService` interface with two implementations — `OllamaLlmService` and `OpenAiLlmService`. We are NOT changing the architecture or adding a new provider. We are only changing the default Ollama model name from qwen3:8b to gemma4:e4b.
- ILlmService consumers expect plain text completions (sometimes JSON-formatted output that is then parsed). Gemma 4 should handle these workloads identically to qwen3:8b, but quality may differ.

PRE-FLIGHT CHECKS — halt if any fails:

1. Working tree clean:
   git status --porcelain
   Should output nothing.

2. On main (or a feature branch you intend to use):
   git rev-parse --abbrev-ref HEAD
   If on main, branch off:
     git checkout -b chore/swap-ollama-model-to-gemma4
   If already on a feature branch, fine.

EXECUTE THESE EXACT FILE EDITS (replace `qwen3:8b` with `gemma4:e4b`):

### Source code defaults (3 files)

1. `backend/src/Api/Program.cs` — line where you see:
     options.OllamaModel = builder.Configuration["Ollama:Model"] ?? "qwen3:8b";
   Change to:
     options.OllamaModel = builder.Configuration["Ollama:Model"] ?? "gemma4:e4b";

2. `backend/src/Application/LLM/OllamaLlmService.cs` — line where you see:
     _model = config["Ollama:Model"]
         ?? Environment.GetEnvironmentVariable("OLLAMA_MODEL")
         ?? "qwen3:8b";
   Change the fallback string to "gemma4:e4b".

3. `backend/src/Vocabulary/TextStack.Vocabulary/VocabularyOptions.cs` — line:
     public string OllamaModel { get; set; } = "qwen3:8b";
   Change to:
     public string OllamaModel { get; set; } = "gemma4:e4b";

### Configuration files (NOT in bin/ — those regenerate)

4. `backend/src/Api/appsettings.json` — find `"Model": "qwen3:8b"` under the `"Ollama"` key. Change to `"gemma4:e4b"`.

5. `backend/src/Worker/appsettings.json` — same.

DO NOT EDIT files under `bin/` directories — those are build artifacts and will be regenerated on next `dotnet build`.

### Docker Compose

6. `docker-compose.yml` — find:
     Ollama__Model: qwen3:8b
   Change to:
     Ollama__Model: gemma4:e4b

   Verify the Ollama service `memory: 4G` limit is sufficient for gemma4:e4b. It is (~3-4 GB Q4 fits with headroom). No change needed.

### Documentation (current-state references)

7. `README.md` — find references to `qwen3:8b` (around lines 97 and 124). Update to `gemma4:e4b`. Keep the surrounding text contextually accurate (e.g., "local Ollama `gemma4:e4b` (distractors, local)").

8. `CLAUDE.md` — line 202 mentions "Ollama LLM (`qwen3:8b`) generates 5 distractors...". Update to `gemma4:e4b`.

9. `docs/04-dev/llm-provider-swap.md` — replace `qwen3:8b` with `gemma4:e4b` in the docs section (it's used as an example default).

10. `docs/ux-roadmap/17-ai-auto-tags.md` — replace `qwen3:8b` with `gemma4:e4b`.

11. `PLAN-elevenreader-parity.md` (line 28) — update "Ollama qwen3" to "Ollama gemma4:e4b".

12. `TODO.md` — update or remove the "llama3, mistral, qwen, phi" speculation entry since we've now picked gemma4.

### DO NOT TOUCH

- `CHANGELOG.md` — historical entries (the existing "switched from gemma3:4b to qwen3:8b" entry is historical fact). DO NOT modify it.
- `release-notes-v0.1.0.md` — already used for the v0.1.0 GitHub Release, frozen.
- `hackernews-launch-post.md` — marketing draft, freeze.
- `bin/` directories everywhere — build artifacts.
- Test mocks in `tests/TextStack.UnitTests/` and `tests/TextStack.IntegrationTests/` source files (the test code uses `Mock<ILlmService>`, doesn't reference the model name).

### Add a CHANGELOG entry

13. Open `CHANGELOG.md`. Find the `## [Unreleased]` section near the top. Add a new bullet under `### Changed` (create the subheading if it doesn't exist):

    ```
    ### Changed
    - **Local LLM model**: switched from `qwen3:8b` to `gemma4:e4b`. Smaller footprint
      (~3-4 GB vs 5-6 GB Q4), fits comfortably under the 4 GB Ollama container
      memory limit, and uses Google's Gemma 4 effective-4B architecture (released
      May 2026). Same `ILlmService` interface, no API changes. To roll back:
      set `Ollama__Model=qwen3:8b` env var or update `appsettings.json`.
    ```

### Commit

14. Stage and commit with this message:

    ```
    chore(llm): swap Ollama model from qwen3:8b to gemma4:e4b

    Updates the default local LLM across appsettings, source defaults, docker-
    compose env, and documentation. Same ILlmService interface, no API changes.

    Why:
    - gemma4:e4b is ~3-4 GB Q4 vs qwen3:8b at ~5-6 GB Q4 — fits comfortably
      under the 4 GB Ollama container limit without OOM-kill risk.
    - Released May 2026 by Google; "effective 4B" architecture should be
      competitive with qwen3:8b on the distractor/hint/metadata generation
      tasks we use it for.
    - Eligible for Dev.to's Gemma 4 Challenge submission.

    Rollback: set Ollama__Model=qwen3:8b in env or revert this commit.

    Files changed:
    - backend/src/Api/Program.cs (default fallback)
    - backend/src/Application/LLM/OllamaLlmService.cs (default fallback)
    - backend/src/Vocabulary/TextStack.Vocabulary/VocabularyOptions.cs (default)
    - backend/src/Api/appsettings.json (config)
    - backend/src/Worker/appsettings.json (config)
    - docker-compose.yml (env)
    - README.md, CLAUDE.md, docs/04-dev/llm-provider-swap.md,
      docs/ux-roadmap/17-ai-auto-tags.md, PLAN-elevenreader-parity.md,
      TODO.md (documentation)
    - CHANGELOG.md (Unreleased entry)
    ```

15. Do NOT push. The user wants to test locally first before pushing.

VERIFICATION:

After all edits, run these checks:

1. No remaining functional references to `qwen3:8b` in source/config (excluding bin/, CHANGELOG.md historical entries, frozen marketing files, and `release-notes-v0.1.0.md`):
   ```
   grep -rn "qwen3:8b" \
     --include="*.cs" --include="*.json" --include="*.yml" --include="*.yaml" \
     --include="*.md" --include="*.sh" --include="Makefile" \
     --exclude-dir=bin --exclude-dir=obj --exclude-dir=node_modules \
     . | grep -v -E '(CHANGELOG\.md|release-notes-v0\.1\.0\.md|hackernews-launch-post\.md):'
   ```
   Expected: empty (no output).

2. Build succeeds:
   ```
   dotnet build textstack.sln
   ```

3. Tests pass (unit tests use mocks, won't actually hit Ollama):
   ```
   dotnet test tests/TextStack.UnitTests
   ```

4. Output a final summary listing:
   - Branch name
   - Commit hash
   - Files changed (count + paths)
   - Confirmation that grep verification returned empty
   - Confirmation that build + tests succeeded
   - Suggested next manual step for the user (see Post-prompt steps below)

If any step fails, do not finalize the commit. Report the issue and propose a fix.
````

---

## Post-prompt manual steps (you do these after Claude Code finishes)

### 1. Pull the model on the production server

SSH to the VPS and pull the new model into the Ollama Docker volume:

```bash
docker compose exec ollama ollama pull gemma4:e4b
```

This downloads the model to `./data/ollama/` so the next deploy can use it without redownloading.

### 2. Test locally before deploying

Run a quick smoke test against your local Ollama (or via docker compose):

```bash
# Start Ollama locally
docker compose up -d ollama

# Pull model
docker exec textstack_ollama ollama pull gemma4:e4b

# Direct test — does gemma4:e4b respond and produce JSON-parseable output?
docker exec textstack_ollama ollama run gemma4:e4b 'Generate 5 multiple-choice distractors for the technical term "eventual consistency" in the context of distributed databases. Output ONLY a JSON array of strings, nothing else.'
```

Expected: a JSON array like `["strong consistency", "linearizability", "ACID", "two-phase commit", "leader election"]` (the exact words don't matter, the format does).

If gemma4:e4b refuses to output strict JSON or wraps it in markdown fences, you'll need to tweak the prompts in:
- `backend/src/Vocabulary/TextStack.Vocabulary/DistractorGenerator.cs`
- `backend/src/Worker/Services/BookMetadataGenerator.cs`
- `backend/src/Worker/Services/TagSuggestionGenerator.cs`

(Look for the "Output ONLY..." or "Respond with JSON" instructions and make them stricter — Gemma sometimes adds preamble.)

### 3. End-to-end test

Save a new vocabulary word in TextStack and verify:
- Distractors are generated (5 of them)
- Hint is generated (1 short hint)
- Explanation is generated (2-3 sentences)

If all three appear in the database within ~10-30 seconds, the swap works.

### 4. Push and deploy

```bash
git push origin chore/swap-ollama-model-to-gemma4
# Open PR, merge to main when ready
# CI will build and deploy
```

After deploy:
- `make logs` to watch for Ollama-related errors
- Monitor a couple of vocabulary saves to confirm distractors generate

### 5. Rollback path

If something breaks in production:

```bash
# Quick env override (no code change)
ssh server
cd /path/to/textstack
docker compose exec api sh -c 'echo "Ollama__Model=qwen3:8b" >> .env'
docker compose restart api worker
```

Or revert the commit and redeploy.

---

## Summary of files affected

**Functional (must change):**
- 3 source files (defaults)
- 2 config files (appsettings.json — Api + Worker)
- 1 docker-compose.yml

**Documentation (must change for accuracy):**
- README.md, CLAUDE.md
- docs/04-dev/llm-provider-swap.md
- docs/ux-roadmap/17-ai-auto-tags.md
- PLAN-elevenreader-parity.md
- TODO.md

**Tracking (add Unreleased entry):**
- CHANGELOG.md

**Frozen (do NOT change):**
- CHANGELOG.md historical entries
- release-notes-v0.1.0.md
- hackernews-launch-post.md
- bin/ directories
- test mock code

Total: ~10-12 files modified, 1 commit.
