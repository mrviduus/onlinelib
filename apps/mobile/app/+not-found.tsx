import { useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter, usePathname, Stack } from 'expo-router'
import { colors } from '../src/theme/colors'

/**
 * Handles deep links from textstack.app web URLs.
 * Maps web URL patterns to mobile routes:
 *   /en/books/{slug}                → /book/{slug}
 *   /en/books/{slug}/{chapterSlug}  → /reader/{slug}/{chapterSlug}
 *   /{lang}/vocabulary              → /vocabulary
 *   /{lang}/stats                   → /stats
 */
export default function NotFoundScreen() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Try to redirect web URLs to mobile routes
    const match = pathname.match(/^\/(en|uk)\/books\/([^/]+)(?:\/([^/]+))?/)
    if (match) {
      const [, , slug, chapter] = match
      if (chapter) {
        router.replace(`/reader/${slug}/${chapter}`)
      } else {
        router.replace(`/book/${slug}`)
      }
      return
    }

    const vocabMatch = pathname.match(/^\/(en|uk)\/vocabulary/)
    if (vocabMatch) {
      router.replace('/vocabulary')
      return
    }

    const statsMatch = pathname.match(/^\/(en|uk)\/stats/)
    if (statsMatch) {
      router.replace('/stats')
      return
    }
  }, [pathname, router])

  return (
    <>
      <Stack.Screen options={{ title: 'Not Found', headerShown: true }} />
      <View style={styles.center}>
        <Text style={styles.title}>Page not found</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace('/')}>
          <Text style={styles.btnText}>Go Home</Text>
        </TouchableOpacity>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 20 },
  title: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 16 },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
})
