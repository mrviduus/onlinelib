import { describe, it, expect } from 'vitest'
import type { UserDto } from '@textstack/shared'
import { decideMint, decideApplyGuest, type MintDecision, type ApplyDecision } from './guestSession'

const guest: UserDto = {
  id: 'g-1',
  email: 'guest-0f3a9c1e@guest.local',
  name: null,
  picture: null,
  createdAt: '2026-09-01T00:00:00Z',
  isGuest: true,
  nativeLanguage: null,
}

const account: UserDto = {
  id: 'u-1',
  email: 'reader@example.com',
  name: 'Reader',
  picture: null,
  createdAt: '2026-09-01T00:00:00Z',
  isGuest: false,
  nativeLanguage: 'uk',
}

describe('decideMint — may we mint at all', () => {
  const cases: Array<{
    name: string
    input: { isLoading: boolean; user: UserDto | null }
    expected: MintDecision
  }> = [
    {
      // The load-bearing row. Web gates its trigger on `isAuthenticated`,
      // which is false during bootstrap, so a returning user deep-linking
      // into the reader mints a guest in parallel with restoring their own
      // session: one orphaned server row and one burned rate-limit slot,
      // every cold start.
      name: 'bootstrap in progress, nothing known yet → never mint',
      input: { isLoading: true, user: null },
      expected: { action: 'skip', reason: 'bootstrapping' },
    },
    {
      name: 'bootstrap in progress even with a user already in state → still never mint',
      input: { isLoading: true, user: account },
      expected: { action: 'skip', reason: 'bootstrapping' },
    },
    {
      name: 'settled, no session → mint',
      input: { isLoading: false, user: null },
      expected: { action: 'mint' },
    },
    {
      name: 'settled, account restored → nothing to do',
      input: { isLoading: false, user: account },
      expected: { action: 'skip', reason: 'session-exists' },
    },
    {
      // A guest IS a session: real tokens, a real server row, /me/* writes
      // all work. Minting a second one would strand the first.
      name: 'settled, guest already present → nothing to do',
      input: { isLoading: false, user: guest },
      expected: { action: 'skip', reason: 'session-exists' },
    },
  ]

  for (const c of cases) {
    it(c.name, () => { expect(decideMint(c.input)).toEqual(c.expected) })
  }
})

describe('decideApplyGuest — may the minted session be written', () => {
  const cases: Array<{
    name: string
    input: { epochAtStart: number; epochNow: number; currentUser: UserDto | null }
    expected: ApplyDecision
  }> = [
    {
      name: 'nothing moved, no session → apply',
      input: { epochAtStart: 3, epochNow: 3, currentUser: null },
      expected: { action: 'apply' },
    },
    {
      // The SecureStore interleave. `signInWithTokens` bumps the epoch
      // synchronously before its three writes; a guest response landing
      // between two of them would otherwise leave a guest access token next
      // to an account refresh token. Discarding here means none of the three
      // guest writes happen.
      name: 'epoch moved (a sign-in started mid-flight) → discard, write nothing',
      input: { epochAtStart: 3, epochNow: 4, currentUser: account },
      expected: { action: 'discard', reason: 'epoch-moved' },
    },
    {
      name: 'epoch moved by a sign-out → discard, do not resurrect the session',
      input: { epochAtStart: 1, epochNow: 2, currentUser: null },
      expected: { action: 'discard', reason: 'epoch-moved' },
    },
    {
      // Belt to the epoch's braces: even if the bump were somehow missed,
      // an anonymous row never overwrites a real account (web's no-downgrade
      // invariant, kept).
      name: 'a real account arrived without an epoch bump → still discard',
      input: { epochAtStart: 0, epochNow: 0, currentUser: account },
      expected: { action: 'discard', reason: 'account-arrived' },
    },
    {
      // Minting is single-flighted, so a second guest response can only mean
      // the one in state is stale — and the freshly-minted tokens are the
      // ones now in SecureStore. State must follow storage.
      name: 'a stale guest is in state → replaceable, apply',
      input: { epochAtStart: 7, epochNow: 7, currentUser: guest },
      expected: { action: 'apply' },
    },
    {
      name: 'epoch moved wins over a replaceable guest',
      input: { epochAtStart: 7, epochNow: 8, currentUser: guest },
      expected: { action: 'discard', reason: 'epoch-moved' },
    },
  ]

  for (const c of cases) {
    it(c.name, () => { expect(decideApplyGuest(c.input)).toEqual(c.expected) })
  }

  it('is checked repeatedly, so the answer must depend only on its inputs', () => {
    // AuthContext consults this before the write block; calling it twice with
    // the same inputs must not drift (no clock, no counter, no storage).
    const input = { epochAtStart: 2, epochNow: 2, currentUser: null }
    expect(decideApplyGuest(input)).toEqual(decideApplyGuest(input))
  })
})
