import { Redirect } from 'expo-router'
import { View } from 'react-native'
import { useAuth } from '../../src/context/AuthContext'
import { useTheme } from '../../src/context/ThemeContext'
import { capabilitiesFor } from '../../src/lib/capabilities'

/**
 * The front door — a redirect, not a screen.
 *
 * There used to be a Home tab here: a greeting, one "continue reading" card,
 * and below it the public-domain catalog, fetched with two `getBooks()` calls
 * and identical for a guest and for a signed-in reader with thirty uploads. It
 * asked the returning reader the one question the app should never ask —
 * "where is my book, Home or Library?" — and answered it with someone else's
 * books. On mobile the catalog cannot even pay for that space: there is no SEO
 * in an app, so the classics bring in nobody here.
 *
 * So the reader's own library is now the front door, and the catalog lives
 * where it is chosen rather than pushed: Discover, which already carries all of
 * it — search, books, authors, genres.
 *
 * This file stays because `/` must keep resolving: the resume-from-background
 * reset (`app/_layout.tsx`) and the deep-link fallback (`app/+not-found.tsx`)
 * both navigate to it. Every existing `replace('/')` now lands correctly for
 * whoever is looking.
 */
export default function IndexRedirect() {
  const { user, isLoading } = useAuth()
  const { colors } = useTheme()

  // Redirecting before the stored session is restored would send a signed-in
  // reader to the catalog for a frame, then snap them to their library.
  if (isLoading) return <View style={{ flex: 1, backgroundColor: colors.background }} />

  // A guest has no library to land in — for them the catalog IS the app.
  //
  // `isAccount`, NOT `hasSession`. This is the one line in the guest-session work
  // where the obvious migration is the wrong one: a guest holds tokens, so
  // `isAuthenticated` is true for them, and keeping it here would land every first
  // launch on an empty Library — the app opening on a blank screen for exactly the
  // reader who has not chosen anything yet. Discover is the only front door with
  // something in it. Acceptance criterion 4, `docs/qa/MOBILE-TEST-PLAN.md`:
  // "`/` redirects to `/library` signed in, `/search` as a guest".
  //
  // The cost is real and accepted: a returning guest who HAS saved books still
  // lands on Discover and taps Library. Cheaper than a blank first screen, and it
  // stops being true the moment they create an account.
  return <Redirect href={capabilitiesFor(user).isAccount ? '/(tabs)/library' : '/(tabs)/search'} />
}
