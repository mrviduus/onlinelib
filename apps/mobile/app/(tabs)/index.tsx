import { Redirect } from 'expo-router'
import { View } from 'react-native'
import { useAuth } from '../../src/context/AuthContext'
import { useTheme } from '../../src/context/ThemeContext'

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
  const { isAuthenticated, isLoading } = useAuth()
  const { colors } = useTheme()

  // Redirecting before the stored session is restored would send a signed-in
  // reader to the catalog for a frame, then snap them to their library.
  if (isLoading) return <View style={{ flex: 1, backgroundColor: colors.background }} />

  // A guest has no library to land in — for them the catalog IS the app.
  return <Redirect href={isAuthenticated ? '/(tabs)/library' : '/(tabs)/search'} />
}
