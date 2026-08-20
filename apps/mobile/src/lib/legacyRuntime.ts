/**
 * Detects the legacy `1.0.0` Expo runtime — the one every build up to 20 shares.
 *
 * `app.json` used `runtimeVersion.policy: "appVersion"`, which resolved to the
 * literal string "1.0.0", while `eas.json` `autoIncrement` bumped only
 * `versionCode`. So every native build reported the same runtime, and an OTA
 * published to it could land on a binary lacking the native modules that update
 * needed. The defensive `try { require(...) } catch {}` blocks in useTts.ts,
 * vocabReminder.ts and profile.tsx are that hazard already happening in silence.
 *
 * Moving to `runtimeVersion.policy: "fingerprint"` fixes it structurally — the
 * runtime hashes the native inputs, so adding a native dependency changes it by
 * construction. The unavoidable cost is that no future update can target "1.0.0"
 * again. See LegacyRuntimeBanner for what we do about that.
 */
export const LEGACY_RUNTIME = '1.0.0'

/**
 * True only for a real, updates-enabled Android build pinned to the legacy runtime.
 *
 * - `isEnabled` is false in Expo Go and dev clients, which report a null or
 *   development runtime and must never see the banner.
 * - Android-only: the farewell OTA is published for Android, and there is no iOS
 *   store listing to send anyone to.
 * - Builds made after the fingerprint switch carry a hash, never "1.0.0", so this
 *   returns false on them without needing to be removed.
 */
export function isLegacyRuntime(
  runtimeVersion: string | null,
  isEnabled: boolean,
  platform: string,
): boolean {
  return isEnabled && platform === 'android' && runtimeVersion === LEGACY_RUNTIME
}
