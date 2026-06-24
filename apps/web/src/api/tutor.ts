import { authFetch } from './client'

// Learning Tutor agent (AI-Agent-2). The tutor PLANS what to study next over the learner's real SRS +
// reading state and hands off to the existing vocabulary-review flow. JSON (SSE deferred). The plan is held
// server-side in a session so the HITL re-plan turn survives across requests.

// --- Types (mirror Contracts/Agents/TutorDtos.cs, camelCase via the API) ---

/**
 * One planned study item. The backend now ENRICHES each item with the full card payload (translation,
 * definition, sentence, bookTitle, hint, distractors), so the UI renders cards straight from the plan —
 * no separate vocab fetch + join. References a REAL vocab card by `wordId`, with per-item `why` reasoning.
 */
export interface TutorPlanItem {
  wordId: string
  word: string
  stage: number
  exerciseType: string // recognition | recall | context
  difficulty: string // label string
  why: string // per-item reasoning
  translation?: string | null
  definition?: string | null
  sentence?: string | null
  bookTitle?: string | null
  hint?: string | null
  distractors: string[] // [] when none, never null
}

/** The tutor's response: the persisted session, the ordered plan, and the surfaced reasoning. */
export interface TutorSessionResponse {
  sessionId: string
  plan: TutorPlanItem[]
  rationale: string // overall session reasoning
  readingNudge: string // ties back to reading (the thesis)
  runId: string
}

/** One learner result fed back to the tutor for re-planning. */
export interface TutorFeedbackResult {
  wordId: string
  correct: boolean
  responseTimeMs: number
}

// --- API Functions ---

/** Plan a new tutor session over the learner's current state. `maxItems` is optional (server-capped). */
export async function startTutorSession(maxItems?: number, signal?: AbortSignal): Promise<TutorSessionResponse> {
  return authFetch<TutorSessionResponse>('/me/tutor/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(maxItems != null ? { maxItems } : {}),
    signal,
  })
}

/**
 * Submit the learner's results for the current session and get the re-planned remainder. An empty `plan` in
 * the response means the session is complete.
 */
export async function sendTutorFeedback(
  sessionId: string,
  results: TutorFeedbackResult[],
  signal?: AbortSignal,
): Promise<TutorSessionResponse> {
  return authFetch<TutorSessionResponse>(`/me/tutor/session/${sessionId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ results }),
    signal,
  })
}
