/**
 * What a tap on the reader's Save button should do.
 *
 * The reader's one teaching moment — the tap coachmark — tells every new reader to
 * "press and hold a word … then tap Save". Until now the Save button was rendered
 * inside `{isAuthenticated && …}` in `SelectionActionBar`, so for a reader with no
 * session the promised control simply was not on screen. The loop the whole app is
 * built around (read → meet a word → keep it) ended at a button that did not exist,
 * and nothing said why.
 *
 * Showing the button to everyone moves the problem, it does not solve it: a button
 * that silently does nothing is worse than one that is absent. So the tap has to
 * answer for itself, and the answer is a decision with exactly three outcomes —
 * which is what lives here.
 *
 * It lives in `src/lib` and not in the component because this app has no
 * component or hook test lane at all; `src/lib/*.test.ts` (vitest) is the only
 * thing CI actually runs on mobile logic. A rule kept in JSX is a rule nothing
 * can assert. This file is the assertable half, and deliberately nothing more —
 * no toast, no router, no auth lookup, no abstraction over any of them.
 */

export interface SaveWordIntentInput {
  /** A live session. False for a guest — the only reader this decision exists for. */
  isAuthenticated: boolean
  /** There is a word under the toolbar. False when the selection was cleared mid-tap. */
  hasSelection: boolean
}

export type SaveWordIntent =
  /** Signed in, word in hand: POST it. The only outcome that touches the network. */
  | 'save'
  /** No session: explain, and offer the way in. Must never reach the API — an
   *  unauthenticated save is a guaranteed 401 and a lost word. */
  | 'prompt'
  /** Nothing selected. The button should not be reachable in this state, but the
   *  press handler is bound to the toolbar's lifetime, not the selection's. */
  | 'ignore'

/**
 * Note the order: the session is checked *before* the selection, because
 * "you need an account" is the more useful thing to say to someone who is in the
 * middle of losing their word, and because it keeps the guest path free of any
 * condition that could accidentally fall through to `'save'`.
 */
export function saveWordIntent({ isAuthenticated, hasSelection }: SaveWordIntentInput): SaveWordIntent {
  if (!isAuthenticated) return 'prompt'
  if (!hasSelection) return 'ignore'
  return 'save'
}
