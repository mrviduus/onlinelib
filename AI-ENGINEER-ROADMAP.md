# AI Engineer — Career Roadmap

**Owner:** Vasyl Vdovychenko
**Created:** 2026-05-13
**Goal:** Position as AI Engineer and start interviewing in ~6 weeks

---

## Part 1 — Current Profile Audit

### Claims I removed from LinkedIn About (and why)

| Removed | Reason |
|---------|--------|
| **"Hybrid search"** (RAG bullet) | Hybrid = vector + BM25 / keyword. My `rag-chatbot-dotnet` uses vector retrieval only. |
| **"Multi-agent workflows"** (Agent bullet) | No 2+ agents collaborating in my repos. Have single agents with tools, not multi-agent. |
| **"Response distillation"** (Production AI infra) | Distillation = training a smaller model on outputs of a larger one. I do model **selection** (E4B → E2B), which is different. |
| **"Kubernetes"** (Full-stack) | Use Docker Compose + Cloudflare Tunnel, not K8s. No K8s manifests in any repo. |
| **"Anthropic Claude"** (LLM integration) | `.env.example` has `CLAUDE_API_KEY` placeholder, but I haven't verified actual Claude SDK calls in code. **Don't claim until verified.** |

### Final defensible LinkedIn About (every word backed by code)

```
AI Engineer with 10+ years in software engineering. Building production AI systems —
RAG pipelines, agent architectures, LLM orchestration, and observability for ML workloads.

Currently a Senior Software Engineer at Pinnacle focused on SDK and testing tooling;
pursuing AI engineering through personal open-source work. Looking to make this my
full-time focus.

What I build:

• RAG pipelines — Pinecone vector retrieval, OpenAI embeddings, document chunking,
  context-grounded generation via Semantic Kernel

• Agent architectures — ReAct loops, tool orchestration, MCP server implementation,
  function calling, single-agent RAG workflows

• LLM integration — OpenAI, Ollama, Semantic Kernel; model selection,
  quantization tradeoffs, prompt design

• Production AI infrastructure — cost optimization ($0.002/load test cycle),
  multi-tier caching, fall-back routing, model selection

• Observability for ML systems — distributed tracing (OpenTelemetry + Aspire),
  load testing at burst (63K req, p95 20.5ms validated)

• Full-stack delivery — ASP.NET Core, React, React Native (Expo), Postgres,
  Docker Compose, CI/CD

Open to: AI Engineer · ML Engineer · LLM Engineer · AI Infrastructure Engineer ·
AI Platform Engineer · Applied AI Engineer.

Background: 10+ years building scalable cloud systems on .NET / Azure stack.
```

### Headline (final)

```
AI Engineer | RAG · Agents · LLM Infrastructure | 10+ years in software engineering
```

---

## Part 2 — AI Engineer Skill Matrix

What an "ideal AI Engineer" portfolio typically has, and where I stand.

Legend: ✅ have it · ⚠️ partial · ❌ missing

### LLM Integration

| Skill | Status | Evidence |
|-------|--------|----------|
| OpenAI API | ✅ | rag-chatbot, textstack, AiAgents |
| Anthropic Claude API | ⚠️ | .env exists, real SDK call to verify |
| Google Gemini | ⚠️ | .env exists, real SDK call to verify |
| Ollama (open-source models) | ✅ | textstack (Gemma 4) |
| Multi-provider abstraction | ✅ | AI_PROVIDER switch in AiAgents |

### RAG (Retrieval-Augmented Generation)

| Skill | Status | Evidence |
|-------|--------|----------|
| Vector databases (Pinecone/Qdrant/Chroma) | ✅ | Pinecone in rag-chatbot |
| OpenAI embeddings | ✅ | rag-chatbot |
| Document chunking | ✅ | rag-chatbot (Wikipedia indexer) |
| Hybrid search (vector + BM25) | ❌ | — |
| Re-ranking (Cohere, etc.) | ❌ | — |
| Long-context strategies | ❌ | — |
| RAG evaluation (RAGAS) | ❌ | — |

### Agents

| Skill | Status | Evidence |
|-------|--------|----------|
| Function calling | ✅ | FunctionRegistry.cs in AiAgents |
| Tool orchestration | ✅ | ConsoleAgent (weather tool) |
| ReAct loop | ✅ | AiAgents docs + code |
| Agent memory | ✅ | Memory systems in AiAgents docs |
| **MCP server** | ✅ | **Real McpServer (tools + prompts + resources)** |
| MCP client | ❌ | Built server only, not client |
| Multi-agent collaboration | ❌ | — |
| Agent evaluation | ❌ | — |

### Local LLM / On-device

| Skill | Status | Evidence |
|-------|--------|----------|
| Ollama | ✅ | textstack |
| WebLLM (browser inference) | ✅ | ReplyMate |
| Quantization knowledge (Q4, GGUF) | ✅ | VRAM math post |
| GPU offload tuning | ✅ | VRAM math post (2.5× measured) |
| llama.cpp directly | ❌ | — |
| vLLM / TGI / Triton | ❌ | — |

### Production AI Infrastructure

| Skill | Status | Evidence |
|-------|--------|----------|
| Caching strategies | ✅ | textstack disk cache + IndexedDB |
| Cost optimization | ✅ | $0.002/load test (measured) |
| Fall-back routing | ✅ | MC fallback cascade |
| Rate limiting | ✅ | textstack rate-limit middleware |
| Async inference / queues | ✅ | textstack worker |
| A/B testing models | ❌ | — |
| Shadow deployment | ❌ | — |

### Observability / MLOps

| Skill | Status | Evidence |
|-------|--------|----------|
| Distributed tracing OTel | ✅ | xUnitOTel + textstack |
| Load testing | ✅ | LoadSurge (63K req validated) |
| Latency budgets | ✅ | Load test report |
| Cost / token tracking | ⚠️ | Partial, not explicit dashboard |
| LLM eval suites | ❌ | — |
| LangSmith / Helicone | ❌ | — |
| Prompt versioning | ❌ | — |

### ML Fundamentals

| Skill | Status | Evidence |
|-------|--------|----------|
| Embeddings | ✅ | rag-chatbot |
| Transformer arch (engineer-level) | ⚠️ | NVIDIA course in progress |
| Quantization formats (GGUF/AWQ) | ⚠️ | Knows via Ollama, not deep |
| Tokenizers (BPE) | ⚠️ | Concept, not hands-on |
| Fine-tuning / LoRA / PEFT | ❌ | — |
| RLHF / DPO | ❌ | — |

### Frameworks

| Skill | Status | Evidence |
|-------|--------|----------|
| Semantic Kernel | ✅ | rag-chatbot |
| Microsoft.Extensions.AI | ✅ | rag-chatbot |
| LangChain | ❌ | — |
| LlamaIndex | ❌ | — |
| DSPy | ❌ | — |
| AutoGen / CrewAI | ❌ | — |
| Haystack | ❌ | — |

### Deployment

| Skill | Status | Evidence |
|-------|--------|----------|
| Docker / Docker Compose | ✅ | every repo |
| Azure (cloud) | ✅ | Pinnacle background |
| AWS / GCP | ⚠️ | Familiar, not visible in repos |
| Kubernetes | ❌ | use compose |
| GPU cluster mgmt | ❌ | — |
| Model serving (vLLM, Triton) | ❌ | — |

### Safety / Eval

| Skill | Status | Evidence |
|-------|--------|----------|
| Prompt injection defense | ⚠️ | textstack SeoPromptSanitizer (basic) |
| Guardrails | ❌ | — |
| Red-teaming | ❌ | — |
| RAGAS / eval frameworks | ❌ | — |

### Languages

| Lang | Status | Notes |
|------|--------|-------|
| C# / .NET | ✅✅✅ | 12 years |
| TypeScript | ✅ | textstack frontend, ReplyMate |
| **Python** | ❌ | **Biggest gap for AI roles** |
| SQL | ✅ | Postgres |

---

## Part 3 — 6-Week Learning Plan

**Goal:** Close the top 3 most-demanded gaps — Python, LangChain/LlamaIndex, RAG evaluation — before flipping LinkedIn Open-to-Work toggle.

### Cadence assumption

Day job: ~40h/week. Available learning time: ~8-10h/week (evenings + weekends).

Each week has one **shippable artifact** (a repo, doc, or LinkedIn-ready milestone).

---

### Week 1 (May 13 – May 19) — Python AI Foundations

**Goal:** Stop being a "C# guy who knows AI" — establish Python AI workflow.

**Tasks:**
- [ ] Set up Python 3.12 + uv + ruff + ipython on dev machine
- [ ] Install OpenAI Python SDK, run hello-world chat completion
- [ ] Install Anthropic Python SDK, run hello-world (covers the Claude gap honestly)
- [ ] Re-implement `rca` (your LLM-powered test-log analyzer) in Python — single file, ~200 LoC
- [ ] Add it to GitHub as `rca-py` with a clear README

**Deliverable:** `github.com/mrviduus/rca-py` — Python port with both OpenAI and Claude support.

**Why:** This single repo lets me legitimately add "Python · Anthropic Claude" to my LinkedIn skills.

**Resources:**
- Anthropic SDK quickstart: https://docs.anthropic.com/en/api/getting-started
- OpenAI Python SDK: https://github.com/openai/openai-python

---

### Week 2 (May 20 – May 26) — LangChain RAG

**Goal:** Build the same thing my `rag-chatbot-dotnet` does, but in LangChain. This is the most-searched framework on LinkedIn.

**Tasks:**
- [ ] Read LangChain "Get started" + "RAG tutorial"
- [ ] Build a RAG chatbot in Python + LangChain that mirrors my rag-chatbot-dotnet (Wikipedia → Pinecone → OpenAI)
- [ ] Add semantic chunking (`langchain.text_splitter.RecursiveCharacterTextSplitter` with overlap)
- [ ] Add streaming responses
- [ ] Document the architecture in README with a diagram

**Deliverable:** `github.com/mrviduus/rag-chatbot-langchain` — Python equivalent with proper chunking strategy documented.

**Why:** Recruiter searches for "LangChain" return 10× more results than "Semantic Kernel". This single repo makes me searchable.

**Resources:**
- LangChain RAG tutorial: https://python.langchain.com/docs/tutorials/rag/
- Pinecone + LangChain: https://docs.pinecone.io/integrations/langchain

---

### Week 3 (May 27 – Jun 2) — Hybrid Search + Re-ranking

**Goal:** Close the "hybrid search" gap honestly — actually build it.

**Tasks:**
- [ ] Add BM25 retriever to the LangChain rag-chatbot (from `langchain_community.retrievers`)
- [ ] Combine BM25 + vector via `EnsembleRetriever` (50/50 weight)
- [ ] Add Cohere or local re-ranker on top-N results
- [ ] A/B test: pure vector vs hybrid+rerank on 20 hand-written queries — log win rate
- [ ] Write up findings as a dev.to post: "Hybrid search measured: I tested vector vs BM25 vs ensemble"

**Deliverable:**
- Updated rag-chatbot-langchain with hybrid + rerank
- A dev.to post with measurement table

**Why:** Now "hybrid search" is REAL on my profile. Plus another technical post for portfolio.

**Resources:**
- LangChain EnsembleRetriever: https://python.langchain.com/docs/how_to/ensemble_retriever/
- Cohere rerank: https://docs.cohere.com/docs/reranking

---

### Week 4 (Jun 3 – Jun 9) — RAG Evaluation with RAGAS

**Goal:** Add LLM-eval skill — a senior-marker most engineers don't have.

**Tasks:**
- [ ] Install RAGAS (`pip install ragas`)
- [ ] Build a 30-question eval dataset for the rag-chatbot (manual, ~2 hours)
- [ ] Run RAGAS metrics: faithfulness, answer relevancy, context precision, context recall
- [ ] Generate a metrics report (markdown table)
- [ ] Optionally: add a CI workflow (`.github/workflows/ragas-eval.yml`) that runs on every PR

**Deliverable:**
- RAGAS eval suite in rag-chatbot-langchain repo
- README section showing the metrics
- (stretch) GitHub Actions running RAGAS on every commit

**Why:** "LLM evaluation" with concrete metrics is what separates senior from mid AI engineer candidates.

**Resources:**
- RAGAS: https://docs.ragas.io/en/stable/
- LangSmith for tracing (optional): https://docs.smith.langchain.com/

---

### Week 5 (Jun 10 – Jun 16) — Multi-Agent Collaboration

**Goal:** Close the "multi-agent" gap honestly — build it.

**Tasks:**
- [ ] Pick CrewAI or AutoGen (CrewAI is friendlier; AutoGen is Microsoft so synergies with my .NET background)
- [ ] Build a 3-agent system: **Planner → Researcher → Critic**
  - Planner breaks down a question into sub-tasks
  - Researcher uses RAG (your existing LangChain pipeline) to gather facts
  - Critic reviews the synthesis and asks for clarifications
- [ ] Pick a non-trivial task: "Plan a 3-day technical conference agenda from a PDF of past schedules"
- [ ] Document the agent topology with a diagram

**Deliverable:** `github.com/mrviduus/multi-agent-research` — working 3-agent pipeline

**Why:** Now "multi-agent workflows" is REAL. Also opens conversation in interviews about agent design tradeoffs.

**Resources:**
- CrewAI: https://docs.crewai.com/
- AutoGen: https://microsoft.github.io/autogen/

---

### Week 6 (Jun 17 – Jun 23) — Polish + LinkedIn Flip

**Goal:** Update profile to reflect new skills and start interviewing.

**Tasks:**
- [ ] Update LinkedIn About to add new bullets:
  - Python in LLM Integration
  - Hybrid search + RAGAS in RAG Pipelines
  - Multi-agent in Agent Architectures
- [ ] Add Featured items: rca-py, rag-chatbot-langchain, multi-agent-research
- [ ] Add Skills: Python, LangChain, LlamaIndex (if used), RAGAS, CrewAI / AutoGen
- [ ] Reorder Top Skills: LLM, RAG, AI Engineering, **Python**, Agents
- [ ] **Flip "Open to Work" toggle ON** (Recruiters only visibility)
- [ ] Add 5 AI Engineer job titles in Open To Work
- [ ] Write a LinkedIn post: "What I built in 6 weeks pivoting to AI Engineering" — links to all 4 new repos
- [ ] Connect with 10-15 AI engineers in Toronto / Waterloo / remote-Canada

**Deliverable:** Profile that reads as senior AI Engineer with proof, recruiter messages start arriving within 1-2 weeks.

---

## Part 4 — Top 3 Gaps to Close (TL;DR)

In priority order:

1. **Python** — Week 1. Without this, "AI Engineer" doesn't read as believable for most roles.
2. **LangChain or LlamaIndex** — Week 2. Recruiter searches for these in 10× more volume than Semantic Kernel.
3. **LLM evaluation (RAGAS)** — Week 4. Senior-marker that most candidates miss.

Everything else (multi-agent, hybrid search, rerank) is layered on top across weeks 3 and 5.

---

## Part 5 — Nice-to-Have (After Week 6)

If interview pipeline is slow or I want extra ammo:

| Skill | Why | Time |
|-------|-----|------|
| Real Anthropic Claude integration code | Closes the .env-only gap | 1 evening |
| Vector DB diversity (add Qdrant or Chroma) | Shows you can pick, not just use one | 1 weekend |
| Fine-tuning experience (LoRA) | One HuggingFace training run = resume signal | 1 weekend |
| Kubernetes basics (deploy textstack to k3s) | Required for some enterprise roles | 1 week |
| LangSmith / Helicone observability | LLM-specific tracing tools | 1 evening |

---

## Part 6 — Success Metrics

How I know this worked:

- [ ] All 4 new repos live on GitHub with README + topics
- [ ] LinkedIn About updated with backed claims (every word defensible)
- [ ] Open To Work flipped on (recruiters only)
- [ ] LinkedIn search for "AI Engineer Canada" surfaces my profile in top 50
- [ ] First recruiter inreach within 2 weeks of Open To Work flip
- [ ] First technical screen by week 8 (2 weeks after flip)

---

## Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-05-13 | Skip $125 NVIDIA cert payment | Senior engineers don't need "Fundamentals" cert; portfolio speaks louder |
| 2026-05-13 | Headline: "AI Engineer \| RAG · Agents · LLM Infrastructure \| 10+ years in software engineering" | Capability-focused, no project URL, no "Local LLM" niche |
| 2026-05-13 | About: capability-led, not project-led | Senior engineer About reads as skills, not portfolio site |
| 2026-05-13 | Don't flip Open to Work yet | 1 month buffer to add Python + LangChain + RAGAS + multi-agent before recruiter spam |
| 2026-05-13 | Add textstack as separate Experience entry (Self-employed, AI Engineer) | Recruiter search filters by Experience title — needs that entry to be findable |
| 2026-05-13 | "Share profile updates" already OFF | Profile changes don't broadcast to colleagues |
