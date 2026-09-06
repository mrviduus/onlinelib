import { describe, it, expect } from 'vitest'
import { readerGateState, READER_SESSION_GATE_TIMEOUT_MS, type ReaderGateState } from './readerSessionGate'
import type { EnsureSessionResult } from './guestSession'

describe('readerGateState — hold the blank, or mount the reader', () => {
  const cases: Array<{
    name: string
    input: { authLoading: boolean; outcome: EnsureSessionResult | null; timedOut: boolean }
    expected: ReaderGateState
  }> = [
    {
      name: 'bootstrap still reading the keychain → wait',
      input: { authLoading: true, outcome: null, timedOut: false },
      expected: 'wait',
    },
    {
      name: 'bootstrap settled, mint in flight → wait',
      input: { authLoading: false, outcome: null, timedOut: false },
      expected: 'wait',
    },
    {
      // THE case. A guest mint that fails must cost the reader nothing but a
      // session: reading works offline from the chapter cache, and a gate
      // that hid the book on a failed network call would break the one thing
      // the reader is for.
      name: 'MINT FAILED (offline / 429 / token-less response) → render, signed out',
      input: { authLoading: false, outcome: { status: 'failed', error: new Error('offline') }, timedOut: false },
      expected: 'render',
    },
    {
      // Same guarantee, other trigger: a socket that hangs open with no
      // answer. The deadline is measured from gate mount, not from the
      // request, so nothing about the network can extend it.
      name: 'TIMED OUT with no answer at all → render, signed out',
      input: { authLoading: false, outcome: null, timedOut: true },
      expected: 'render',
    },
    {
      name: 'timed out while bootstrap is STILL loading → render anyway (the deadline outranks everything)',
      input: { authLoading: true, outcome: null, timedOut: true },
      expected: 'render',
    },
    {
      name: 'minted → render',
      input: { authLoading: false, outcome: { status: 'minted' }, timedOut: false },
      expected: 'render',
    },
    {
      name: 'account already restored → render, no mint happened',
      input: { authLoading: false, outcome: { status: 'existing', isGuest: false }, timedOut: false },
      expected: 'render',
    },
    {
      name: 'guest already present → render',
      input: { authLoading: false, outcome: { status: 'existing', isGuest: true }, timedOut: false },
      expected: 'render',
    },
    {
      name: 'mint discarded because a sign-in won the race → render',
      input: { authLoading: false, outcome: { status: 'discarded', reason: 'epoch-moved' }, timedOut: false },
      expected: 'render',
    },
    {
      // Bootstrap never answered inside its own timeout, so ensureSession
      // refused to mint. That is a settled answer — "we still do not know" —
      // and the book opens on it rather than waiting further.
      name: 'mint skipped because bootstrap never settled → render',
      input: { authLoading: false, outcome: { status: 'skipped', reason: 'bootstrapping' }, timedOut: false },
      expected: 'render',
    },
  ]

  for (const c of cases) {
    it(c.name, () => { expect(readerGateState(c.input)).toBe(c.expected) })
  }

  it('every terminal outcome renders — no status may ever hide the book', () => {
    const terminal: EnsureSessionResult[] = [
      { status: 'existing', isGuest: false },
      { status: 'existing', isGuest: true },
      { status: 'minted' },
      { status: 'discarded', reason: 'epoch-moved' },
      { status: 'discarded', reason: 'account-arrived' },
      { status: 'skipped', reason: 'bootstrapping' },
      { status: 'failed', error: new Error('boom') },
    ]
    for (const outcome of terminal) {
      expect(readerGateState({ authLoading: false, outcome, timedOut: false })).toBe('render')
    }
  })

  it('the blank is capped at a few seconds, not web bootstrap length', () => {
    // A blank screen past ~4s reads as a crash and the user backs out of the
    // book; web's 15s bootstrap budget would be unusable here.
    expect(READER_SESSION_GATE_TIMEOUT_MS).toBeGreaterThan(1_000)
    expect(READER_SESSION_GATE_TIMEOUT_MS).toBeLessThanOrEqual(4_000)
  })
})
