import { authFetch } from './client'

// Librarian agent (AI-Agent-3). Runs a multi-call agent over the user's catalog from a natural-language
// request and returns ranked, REASONED recommendations as JSON (SSE deferred). Recommend-only: external
// (Open Library) hits are suggestions, never ingested — they are NOT in the library yet.

// --- Validation (mirrors LibrarianEndpoints.cs: ≥2 trimmed chars, ≤500 chars) ---

export const MIN_QUERY_LENGTH = 2
export const MAX_QUERY_LENGTH = 500

/** Pure client guard mirroring the backend: returns true when the query is worth a (rate-limited) agent run. */
export function isValidLibrarianQuery(query: string): boolean {
  const trimmed = query.trim()
  return trimmed.length >= MIN_QUERY_LENGTH && query.length <= MAX_QUERY_LENGTH
}

// --- Types (mirror Contracts/Agents/LibrarianDtos.cs, camelCase via the API) ---

/**
 * Where a recommendation came from. `library` → the book IS in the catalog (`slug`/`editionId` set) — link
 * to its page. `open_library` → an external suggestion NOT in the library yet (no slug) — never link in-app.
 */
export type LibrarianSource = 'library' | 'open_library'

/** One ranked recommendation. `why` is the per-item, request-grounded reason. */
export interface LibrarianRecommendation {
  source: LibrarianSource
  editionId?: string | null
  slug?: string | null
  title: string
  authors: string[]
  why: string
  language?: string | null
  year?: number | null
  pages?: number | null
}

/**
 * The librarian's response: ranked `recommendations`, the overall `reasoning`, `usedExternal` (did it expand
 * to Open Library because the library was thin?) and the persisted `runId` for replay in the admin UI.
 */
export interface LibrarianResponse {
  recommendations: LibrarianRecommendation[]
  reasoning: string
  usedExternal: boolean
  runId: string
}

// --- API Functions ---

/** Run the librarian on a natural-language request. Auth required (`/me/*`); rate-limited 8/min. */
export async function askLibrarian(query: string, signal?: AbortSignal): Promise<LibrarianResponse> {
  return authFetch<LibrarianResponse>('/me/librarian', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal,
  })
}
