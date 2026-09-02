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
  /** Android versionCode of the build the JS was published from. */
  versionCode?: number | string | null
  /** False in a dev client, Expo Go and on web, where no update can exist. */
  updatesEnabled: boolean
  /** True when running the bundle shipped inside the APK, false after an OTA. */
  isEmbeddedLaunch: boolean
  updateCreatedAt?: Date | null
}

/** `TextStack 1.0.0 (24)`, or without the parenthetical when no build number is known. */
export function versionLine(info: BuildInfo): string {
  const version = info.version?.trim()
  if (!version) return 'TextStack'
  // 0 is not a versionCode any build carries, so falsy is the right test:
  // a missing value and a zero both mean "nothing to show here".
  const code = info.versionCode
  return code ? `TextStack ${version} (${code})` : `TextStack ${version}`
}

/** What produced the JS currently running. */
export function updateLine(info: BuildInfo): string {
  // Without expo-updates running there is no embedded-vs-OTA distinction to
  // draw, and `isEmbeddedLaunch` is false — which would otherwise be read as
  // "an update is applied" on a dev client, where none can be.
  if (!info.updatesEnabled) return 'Development build'
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
