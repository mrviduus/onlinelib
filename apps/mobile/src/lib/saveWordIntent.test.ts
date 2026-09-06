import { describe, it, expect } from 'vitest'
import { saveWordIntent, type SaveWordIntent, type SaveWordIntentInput } from './saveWordIntent'

/**
 * The behaviours this table protects, in the order they matter:
 *
 *   1. a guest who taps Save is never sent to the API (guaranteed 401, lost word),
 *   2. a guest who taps Save is never left with nothing happening,
 *   3. signing in changes nothing about the existing save path.
 *
 * Cases are named for the behaviour, not the inputs, because the inputs are two
 * booleans and reading `true, false` back tells you nothing about what broke.
 */
const cases: { name: string; input: SaveWordIntentInput; expected: SaveWordIntent }[] = [
  {
    name: 'a signed-in reader with a word selected saves it',
    input: { isAuthenticated: true, hasSelection: true },
    expected: 'save',
  },
  {
    name: 'a guest is offered the way in rather than a dead button',
    input: { isAuthenticated: false, hasSelection: true },
    expected: 'prompt',
  },
  {
    name: 'a guest is offered the way in even with nothing selected — the session is the blocker',
    input: { isAuthenticated: false, hasSelection: false },
    expected: 'prompt',
  },
  {
    name: 'a stale press after the selection cleared does nothing at all',
    input: { isAuthenticated: true, hasSelection: false },
    expected: 'ignore',
  },
]

describe('saveWordIntent', () => {
  for (const { name, input, expected } of cases) {
    it(name, () => {
      expect(saveWordIntent(input)).toBe(expected)
    })
  }

  it('never asks for a network call without a session', () => {
    // The load-bearing assertion of this slice. `'save'` is the only outcome the
    // caller turns into a POST, so proving no unauthenticated input can produce it
    // proves the guest path is offline by construction — not by a `if (!isAuthenticated)`
    // guard someone can delete inside the request hook.
    for (const hasSelection of [true, false]) {
      expect(saveWordIntent({ isAuthenticated: false, hasSelection })).not.toBe('save')
    }
  })

  it('is a pure function of its input — same input, same answer', () => {
    // It is read from a press handler that re-runs on every render; a decision
    // that drifted between two identical presses would be untraceable on device.
    const input: SaveWordIntentInput = { isAuthenticated: false, hasSelection: true }
    expect(saveWordIntent(input)).toBe(saveWordIntent(input))
  })
})
