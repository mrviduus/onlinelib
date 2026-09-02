// Which build is this?
//
// The app could not answer that from inside itself. The store shows a
// versionCode, the app showed nothing, and an OTA replaces the JS without
// moving either number — so "is the fix in the copy I am holding?" had no
// answer that did not involve Play Console.
//
// Two lines, because there are two things that can be out of date: the native
// build, which only Play can replace, and the JS bundle, which arrives on its
// own. A tester needs to tell them apart; the day this was written was spent
// on exactly that distinction.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type BuildInfo = {
  version?: string | null
  /**
   * Android versionCode read from the installed package, not from the manifest —
   * so it keeps naming the build you installed after an OTA replaces the JS.
   */
  versionCode?: number | string | null
  /** True when running from Metro — a dev client, Expo Go, or web. */
  isDev: boolean
  /** False where expo-updates is not active, so no update can exist. */
  updatesEnabled: boolean
  /** True when running the bundle shipped inside the APK, false after an OTA. */
  isEmbeddedLaunch: boolean
  updateCreatedAt?: Date | null
}

/**
 * `TextStack 1.0.0 (24)` — or `1.0.0 (24)` with `short`, for the About row,
 * where the app's name is already the screen it sits on.
 *
 * The parenthetical is dropped when no build number is known, which is the
 * normal state in a dev client: versionCode belongs to an installed package.
 */
export function versionLine(info: BuildInfo, opts?: { short?: boolean }): string {
  const name = opts?.short ? '' : 'TextStack'
  const version = info.version?.trim()
  if (!version) return name || '—'
  // 0 is not a versionCode any build carries, so falsy is the right test:
  // a missing value and a zero both mean "nothing to show here".
  const withCode = info.versionCode ? `${version} (${info.versionCode})` : version
  return name ? `${name} ${withCode}` : withCode
}

/** What produced the JS currently running. */
export function updateLine(info: BuildInfo): string {
  // Two separate ways there is no update to speak of, and both were needed.
  // `isEnabled` alone was not enough: a development build has expo-updates
  // configured and reports true, while `isEmbeddedLaunch` is false because the
  // bundle came from Metro — which rendered as "Updated over the air" on a
  // dev client. Seen on the emulator, not deduced.
  if (info.isDev || !info.updatesEnabled) return 'Development build'
  if (info.isEmbeddedLaunch) return 'Bundled with the app'
  const at = info.updateCreatedAt
  // An update with no date is still an update, and saying so beats claiming
  // the bundle is the embedded one.
  if (!at || Number.isNaN(at.getTime())) return 'Updated over the air'
  // Spelled out by hand rather than through toLocaleDateString. Hermes ships
  // without full ICU unless the build opts in, so the platform formatter is
  // not dependable here — and even where it works it drifts with the ICU
  // version ('Sep' vs 'Sept'). This is a diagnostic read back over chat; it
  // should look the same on every device.
  return `Updated ${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}`
}
