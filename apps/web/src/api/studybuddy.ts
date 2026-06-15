import { authFetch } from './client'
import { API_BASE } from './client'
import { postSse } from '../lib/sse'

// Study Buddy agent (Phase 6, AI-038). Run = SSE stream of the agent's steps; the persisted run is
// fetched separately for the "show steps" view.

/** One step in the agent's transcript (mirrors the backend AgentStep).  */
export interface StudyBuddyStep {
  index: number
  kind: string // "llm_response" | "tool_result"
  payload: unknown
  at: string
}

/** The terminal `done` event payload.  */
export interface StudyBuddyDone {
  runId: string
  answer: string
  iterations: number
  costUsd: number
}

export interface StudyBuddyRunCallbacks {
  onStep: (step: StudyBuddyStep) => void
  onDone: (done: StudyBuddyDone) => void
  onError: (message: string) => void
}

/**
 * Runs the Study Buddy agent on a passage and streams its steps. Resolves when the stream ends;
 * `onDone` fires on success, `onError` on a terminal error event (or a transport failure).
 */
export async function runStudyBuddy(
  editionId: string,
  passage: string,
  chapterNumber: number | null,
  cb: StudyBuddyRunCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  await postSse(
    `${API_BASE}/me/books/${editionId}/studybuddy`,
    { passage, chapterNumber },
    e => {
      if (signal?.aborted) return
      if (e.event === 'step') {
        try {
          cb.onStep(JSON.parse(e.data) as StudyBuddyStep)
        } catch {
          // malformed step — skip it, the run continues
        }
      } else if (e.event === 'done') {
        try {
          cb.onDone(JSON.parse(e.data) as StudyBuddyDone)
        } catch {
          cb.onError('Malformed response')
        }
      } else if (e.event === 'error') {
        let message = 'Study Buddy failed'
        try {
          message = (JSON.parse(e.data) as { error?: string }).error ?? message
        } catch {
          // keep the default
        }
        cb.onError(message)
      }
    },
    signal,
  )
}

/** A persisted run for the "show steps" view (mirrors the backend StudyBuddyRunDto). */
export interface StudyBuddyRun {
  id: string
  agent: string
  status: string
  output: string | null
  steps: StudyBuddyStep[]
  iterations: number
  costUsd: number
  latencyMs: number
  error: string | null
  createdAt: string
}

export function getStudyBuddyRun(runId: string, signal?: AbortSignal): Promise<StudyBuddyRun> {
  return authFetch<StudyBuddyRun>(`/me/studybuddy/runs/${runId}`, { signal })
}
