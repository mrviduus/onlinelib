import { describe, it, expect } from 'vitest'
import { resolveListScreenState, type ListScreenState, type ListScreenInput } from './listScreenState'

const AUTH_LOADING = [true, false]
const AUTH = [true, false]
const LOADING = [true, false]
const ERRORS: ListScreenInput['loadError'][] = [null, 'offline', 'failed']
const HAS_ITEMS = [true, false]

/** Every input the five fields can take: 2 × 2 × 2 × 3 × 2 = 48. */
function cross(): ListScreenInput[] {
  const out: ListScreenInput[] = []
  for (const isAuthLoading of AUTH_LOADING)
    for (const isAuthenticated of AUTH)
      for (const loading of LOADING)
        for (const loadError of ERRORS)
          for (const hasItems of HAS_ITEMS)
            out.push({ isAuthLoading, isAuthenticated, loading, loadError, hasItems })
  return out
}

/** The settled half — auth has answered. The other 24 are the bootstrap window. */
function settled(): ListScreenInput[] {
  return cross().filter(i => !i.isAuthLoading)
}

describe('resolveListScreenState', () => {
  it('covers the whole input space', () => {
    expect(cross()).toHaveLength(48)
  })

  it('never returns anything outside the six named states', () => {
    const allowed: ListScreenState[] = ['signin', 'loading', 'offline', 'failed', 'empty', 'list']
    for (const input of cross()) {
      expect(allowed).toContain(resolveListScreenState(input))
    }
  })

  describe('auth still restoring', () => {
    it('never flashes the sign-in wall on a cold start', () => {
      // The whole point of the field. `isAuthenticated` is `AuthContext`'s
      // `user !== null`, and it is `false` for every frame of the SecureStore
      // read — so before this, a returning reader opening Vocabulary from a
      // cold start got "Sign in to build your personal vocabulary list." until
      // storage answered, then had it replaced. Once a guest session is minted
      // asynchronously, that window stops being a race and becomes the norm.
      for (const input of cross().filter(i => i.isAuthLoading)) {
        expect(resolveListScreenState(input)).not.toBe('signin')
      }
    })

    it('is loading for all twenty-four bootstrap inputs — it outranks even "no session"', () => {
      const booting = cross().filter(i => i.isAuthLoading)
      expect(booting).toHaveLength(24)
      for (const input of booting) {
        expect(resolveListScreenState(input)).toBe('loading')
      }
    })

    it('shows the skeleton, not a wall, when the previous session left an error behind', () => {
      expect(resolveListScreenState({
        isAuthLoading: true, isAuthenticated: false, loading: false, loadError: 'failed', hasItems: false,
      })).toBe('loading')
    })
  })

  describe('no session', () => {
    it('is signin for all twelve settled signed-out inputs — nothing else can outrank it', () => {
      const signedOut = settled().filter(i => !i.isAuthenticated)
      expect(signedOut).toHaveLength(12)
      for (const input of signedOut) {
        expect(resolveListScreenState(input)).toBe('signin')
      }
    })

    it('no session wins over loading', () => {
      // Both screens start with `loading: true`, so the other order shows a
      // skeleton to a reader who has no account and whose data will never
      // arrive — the sign-in invitation would flash in after a spinner that was
      // always a lie. There is nothing in flight; there must not be.
      expect(resolveListScreenState({
        isAuthLoading: false, isAuthenticated: false, loading: true, loadError: null, hasItems: false,
      })).toBe('signin')
    })

    it('no session wins over a failure — a 401 is not "something went wrong on our side"', () => {
      // The actual bug. `isOfflineError` is false for a 401, so the screen set
      // `failed` and rendered "Couldn't load your library" with a Retry button
      // that 401s forever.
      expect(resolveListScreenState({
        isAuthLoading: false, isAuthenticated: false, loading: false, loadError: 'failed', hasItems: false,
      })).toBe('signin')
      expect(resolveListScreenState({
        isAuthLoading: false, isAuthenticated: false, loading: false, loadError: 'offline', hasItems: false,
      })).toBe('signin')
    })

    it('is signin even with stale items left on screen from a previous session', () => {
      expect(resolveListScreenState({
        isAuthLoading: false, isAuthenticated: false, loading: false, loadError: null, hasItems: true,
      })).toBe('signin')
    })
  })

  describe('signed in, request in flight', () => {
    it('is loading regardless of items or a previous error', () => {
      const inFlight = settled().filter(i => i.isAuthenticated && i.loading)
      expect(inFlight).toHaveLength(6)
      for (const input of inFlight) {
        expect(resolveListScreenState(input)).toBe('loading')
      }
    })
  })

  describe('signed in, settled', () => {
    it('has words but offline is not empty', () => {
      // The regression the comment in vocabulary.tsx describes: the screen told
      // a reader who had saved a word that they had none, because the only
      // condition was `words.length === 0`. Items outrank the failure — the
      // list renders and the failure becomes a caveat the screen adds itself.
      expect(resolveListScreenState({
        isAuthLoading: false, isAuthenticated: true, loading: false, loadError: 'offline', hasItems: true,
      })).toBe('list')
      expect(resolveListScreenState({
        isAuthLoading: false, isAuthenticated: true, loading: false, loadError: 'failed', hasItems: true,
      })).toBe('list')
    })

    it('is list when everything worked and there is something to show', () => {
      expect(resolveListScreenState({
        isAuthLoading: false, isAuthenticated: true, loading: false, loadError: null, hasItems: true,
      })).toBe('list')
    })

    it('surfaces the failure by name when there is nothing to show', () => {
      expect(resolveListScreenState({
        isAuthLoading: false, isAuthenticated: true, loading: false, loadError: 'offline', hasItems: false,
      })).toBe('offline')
      expect(resolveListScreenState({
        isAuthLoading: false, isAuthenticated: true, loading: false, loadError: 'failed', hasItems: false,
      })).toBe('failed')
    })

    it('is empty only when the request succeeded and returned nothing', () => {
      // "You have no words" is a claim about the account. It requires an answer.
      const empties = cross().filter(i => resolveListScreenState(i) === 'empty')
      expect(empties).toEqual([
        { isAuthLoading: false, isAuthenticated: true, loading: false, loadError: null, hasItems: false },
      ])
    })
  })

  it('reaches every state from some input', () => {
    const seen = new Set(cross().map(resolveListScreenState))
    expect([...seen].sort()).toEqual(['empty', 'failed', 'list', 'loading', 'offline', 'signin'])
  })
})
