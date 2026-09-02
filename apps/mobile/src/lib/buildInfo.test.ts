import { describe, it, expect } from 'vitest'
import { versionLine, updateLine } from './buildInfo'

const embedded = { updatesEnabled: true, isEmbeddedLaunch: true }

describe('versionLine', () => {
  it('names the version and the build', () => {
    expect(versionLine({ ...embedded, version: '1.0.0', versionCode: 24 })).toBe('TextStack 1.0.0 (24)')
  })

  it('drops the parenthetical when no build number is known', () => {
    // The local dev client and Expo Go both get here: versionCode is written
    // by EAS at build time and simply is not present otherwise.
    expect(versionLine({ ...embedded, version: '1.0.0' })).toBe('TextStack 1.0.0')
    expect(versionLine({ ...embedded, version: '1.0.0', versionCode: null })).toBe('TextStack 1.0.0')
  })

  it('says nothing it cannot back up', () => {
    // Better a bare name than "TextStack undefined", which reads as a bug in
    // the screen rather than as a missing value.
    expect(versionLine({ ...embedded })).toBe('TextStack')
    expect(versionLine({ ...embedded, version: '  ' })).toBe('TextStack')
  })
})

describe('updateLine', () => {
  it('distinguishes the shipped bundle from one that arrived later', () => {
    expect(updateLine({ updatesEnabled: true, isEmbeddedLaunch: true })).toBe('Bundled with the app')
    expect(updateLine({ updatesEnabled: true, isEmbeddedLaunch: false, updateCreatedAt: new Date('2026-09-02T07:04:00Z') }))
      .toBe('Updated 2 Sep 2026')
  })

  it('still reports an update whose date is missing or unusable', () => {
    expect(updateLine({ updatesEnabled: true, isEmbeddedLaunch: false })).toBe('Updated over the air')
    expect(updateLine({ updatesEnabled: true, isEmbeddedLaunch: false, updateCreatedAt: null }))
      .toBe('Updated over the air')
    expect(updateLine({ updatesEnabled: true, isEmbeddedLaunch: false, updateCreatedAt: new Date('nonsense') }))
      .toBe('Updated over the air')
  })

  it('does not call a dev client an over-the-air update', () => {
    // expo-updates reports isEmbeddedLaunch: false when it is not running at
    // all — on web, in Expo Go and in a dev client. Caught by looking at the
    // rendered screen, which claimed "Updated over the air" in dev.
    expect(updateLine({ updatesEnabled: false, isEmbeddedLaunch: false })).toBe('Development build')
    expect(updateLine({ updatesEnabled: false, isEmbeddedLaunch: true })).toBe('Development build')
  })
})
