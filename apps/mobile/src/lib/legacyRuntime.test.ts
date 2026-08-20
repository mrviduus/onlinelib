import { describe, it, expect } from 'vitest'
import { isLegacyRuntime, LEGACY_RUNTIME } from './legacyRuntime'

// The banner this gates is published as a one-way OTA to the frozen "1.0.0" runtime.
// Getting the predicate wrong is expensive in both directions: too loose and every
// user on a current build is told to update to the build they already have; too tight
// and the stranded users never hear about it — which is the exact silence the banner
// exists to break.
describe('isLegacyRuntime', () => {
  it('matches a real Android build on the legacy runtime', () => {
    expect(isLegacyRuntime(LEGACY_RUNTIME, true, 'android')).toBe(true)
  })

  it('does not match a fingerprint runtime', () => {
    // What runtimeVersion.policy: "fingerprint" produces — the reason this banner is
    // safe to leave in the tree after the switch.
    expect(isLegacyRuntime('a1b2c3d4e5f60718293a4b5c6d7e8f90', true, 'android')).toBe(false)
    expect(isLegacyRuntime('1.1.0', true, 'android')).toBe(false)
  })

  it('does not match Expo Go or a dev client', () => {
    // isEnabled is false there, and the runtime is null or a dev value.
    expect(isLegacyRuntime(null, false, 'android')).toBe(false)
    expect(isLegacyRuntime(LEGACY_RUNTIME, false, 'android')).toBe(false)
  })

  it('does not match iOS — the farewell OTA is Android-only', () => {
    expect(isLegacyRuntime(LEGACY_RUNTIME, true, 'ios')).toBe(false)
  })

  it('does not match a missing runtime version', () => {
    expect(isLegacyRuntime(null, true, 'android')).toBe(false)
  })
})
