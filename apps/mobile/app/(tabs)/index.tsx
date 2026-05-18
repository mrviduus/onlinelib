/**
 * Home screen — redesigned to mirror ElevenReader's layout grammar
 * (greeting → pick up where you left off → "add to your library" grid
 * → collections → recommended) while keeping TextStack's reading-first
 * content and data layer.
 *
 * Information architecture (top → bottom):
 *   1. Greeting header      — time-aware greeting + user name, search + profile + language pill
 *   2. Continue Reading     — ContinueReadingCard (existing, authenticated only)
 *   3. Quick Action Grid    — 2x2: Browse / Upload / Paste-link / Scan (last two are "coming soon")
 *   4. For you              — horizontal list of recently-added books
 *   5. Popular now          — horizontal list with alt sort (falls back to default when unsupported)
 *
 * Data sources: createBooksApi(language).getBooks,
 * plus useQuickStats for the streak pill (authenticated only).
 *
 * Pill-tab "For you / Continue / Recents" from the ref design is NOT
 * shipped here — Continue already lives above as its own card, and a
 * true "Recents" list needs an enriched progress endpoint we don't
 * have yet. Tabs can be added later without changing this file's
 * shape.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import {
  createBooksApi,
  getAnonymousReaderName,
  type Edition,
} from '@textstack/shared'
import { useAuth } from '../../src/context/AuthContext'
import { useTheme } from '../../src/context/ThemeContext'
import { useLanguage } from '../../src/context/LanguageContext'
import { fonts } from '../../src/theme/typography'
import { useQuickStats } from '../../src/hooks/useQuickStats'
import { ContinueReadingCard } from '../../src/components/ContinueReadingCard'
import {
  HorizontalBookList,
  type BookItem,
} from '../../src/components/home/HorizontalBookList'
import { QuickActionGrid } from '../../src/components/home/QuickActionGrid'
import { VocabularyReviewCard } from '../../src/components/home/VocabularyReviewCard'

type GreetingSlot = 'morning' | 'afternoon' | 'evening' | 'night'

function currentSlot(date: Date = new Date()): GreetingSlot {
  const h = date.getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  if (h < 22) return 'evening'
  return 'night'
}

function firstName(name: string | null | undefined): string {
  if (!name) return ''
  const trimmed = name.trim()
  if (!trimmed) return ''
  return trimmed.split(/\s+/)[0]
}

export default function HomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const { language, switchLanguage, t } = useLanguage()
  const { isAuthenticated, user } = useAuth()
  const quickStats = useQuickStats(isAuthenticated)

  const [refreshing, setRefreshing] = useState(false)
  const [forYouItems, setForYouItems] = useState<Edition[]>([])
  const [popularItems, setPopularItems] = useState<Edition[]>([])
  const [loadingBooks, setLoadingBooks] = useState(true)

  // Generation counter guards against language-switch races: if the user
  // toggles EN↔UK before the in-flight Promise.all settles, the stale
  // response would otherwise overwrite the fresh language's content.
  const booksGenRef = useRef(0)

  // Greeting re-evaluates every minute. The previous once-on-mount
  // computation was stale if the home screen stayed mounted across a
  // slot boundary (e.g. user opens the app at 11:58am — "good morning" —
  // puts phone down, reopens at 12:05pm still reading "good morning"),
  // which also skewed the `slotReady` copy (B-19). A 60s tick costs
  // nothing — currentSlot() is two integer comparisons — and lets the
  // screen stay honest without a full re-mount.
  const [slot, setSlot] = useState<GreetingSlot>(() => currentSlot())
  useEffect(() => {
    const tick = () => {
      const next = currentSlot()
      setSlot(prev => (prev === next ? prev : next))
    }
    const interval = setInterval(tick, 60_000)
    return () => clearInterval(interval)
  }, [])

  const loadContent = useCallback(async () => {
    const gen = ++booksGenRef.current
    const api = createBooksApi(language)
    try {
      setLoadingBooks(true)
      const [recent, popular] = await Promise.all([
        api.getBooks({ limit: 12 }),
        // Server may ignore unknown sort values and return the default;
        // that's fine — the row still renders useful content.
        api.getBooks({ limit: 12, sort: 'popular' }).catch(() =>
          api.getBooks({ limit: 12 }),
        ),
      ])
      if (gen !== booksGenRef.current) return
      setForYouItems(recent.items)
      setPopularItems(popular.items)
    } catch (e) {
      if (gen === booksGenRef.current) {
        // Empty states already handle the no-data case — just surface
        // the failure in logs for diagnostics.
        console.warn('Home loadContent failed:', e)
      }
    } finally {
      if (gen === booksGenRef.current) setLoadingBooks(false)
    }
  }, [language])

  useEffect(() => {
    loadContent()
  }, [loadContent])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await loadContent()
    setRefreshing(false)
  }, [loadContent])

  const openBook = useCallback(
    (slug: string) => {
      router.push({ pathname: '/book/[slug]', params: { slug } } as never)
    },
    [router],
  )

  const toBookItems = useCallback(
    (editions: Edition[]): BookItem[] =>
      editions.map((e) => ({
        key: e.id,
        title: e.title,
        author: e.authors?.[0]?.name ?? null,
        coverPath: e.coverPath,
        onPress: () => openBook(e.slug),
      })),
    [openBook],
  )

  const greetingNameRaw = user?.isGuest
    ? getAnonymousReaderName(user.id)
    : (user?.name || '')
  const greetingPrimary = greetingNameRaw
    ? `${t(`home.greeting.${slot}`)}, ${firstName(greetingNameRaw)}`
    : t(`home.greeting.${slot}`)
  const greetingSecondary = t(`home.greeting.${slot}Ready`)

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bgWarm }]}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      {/* Greeting header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerTop}>
          <View style={styles.greetingCol}>
            <Text
              style={[styles.greetingPrimary, { color: colors.text }]}
              numberOfLines={1}
            >
              {greetingPrimary}
            </Text>
            <Text
              style={[styles.greetingSecondary, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {greetingSecondary}
            </Text>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity
              style={[
                styles.iconBtn,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() =>
                switchLanguage('en')
              }
              activeOpacity={0.7}
              accessibilityLabel="Toggle language"
            >
              <Text
                style={[styles.langPillText, { color: colors.textSecondary }]}
              >
                {language.toUpperCase()}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.iconBtn,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() => router.push('/(tabs)/search')}
              activeOpacity={0.7}
              accessibilityLabel="Search"
            >
              <Ionicons
                name="search-outline"
                size={18}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.iconBtn,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={() => router.push('/(tabs)/profile')}
              activeOpacity={0.7}
              accessibilityLabel={isAuthenticated ? 'Profile (signed in)' : 'Sign in'}
              // hitSlop bumps the effective tap area to the 44pt iOS HIG min
              // without pushing the visual circle bigger and crowding the
              // status bar.
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {user?.picture ? (
                <>
                  <Image
                    source={{ uri: user.picture }}
                    style={styles.avatarImg}
                    contentFit="cover"
                    transition={150}
                  />
                  {/* Online dot — visual confirmation of signed-in state.
                      PWA mirrors with an avatar-shaped border ring; the
                      dot reads better at this size. */}
                  <View
                    style={[
                      styles.onlineDot,
                      { backgroundColor: '#22c55e', borderColor: colors.surface },
                    ]}
                  />
                </>
              ) : (
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={colors.textSecondary}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Optional streak pill under greeting when authenticated and on a streak */}
        {quickStats && quickStats.currentStreak > 0 ? (
          <TouchableOpacity
            style={[
              styles.streakPill,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
            onPress={() => router.push('/stats/')}
            activeOpacity={0.7}
          >
            <Ionicons name="flame" size={14} color={colors.primary} />
            <Text style={[styles.streakText, { color: colors.text }]}>
              {quickStats.currentStreak}d streak
            </Text>
            <Text
              style={[styles.streakSub, { color: colors.textSecondary }]}
            >
              · {Math.round(quickStats.todaySeconds / 60)}m today
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Continue reading card (authenticated) */}
      {isAuthenticated ? <ContinueReadingCard /> : null}

      {/* Vocabulary review card (authenticated) */}
      {isAuthenticated ? <VocabularyReviewCard /> : null}

      {/* Quick action grid */}
      <QuickActionGrid
        onBrowse={() => router.push('/(tabs)/search')}
        onUpload={() =>
          router.push(
            isAuthenticated ? '/my-books/upload' : '/auth/login',
          )
        }
        // onPasteLink / onScan left undefined — the grid surfaces
        // "Coming soon" alerts to signal future capability.
      />

      {/* For you */}
      <HorizontalBookList
        title={t('home.sections.forYou')}
        items={toBookItems(forYouItems)}
        loading={loadingBooks}
        emptyText={t('home.empty.forYou')}
        emptyCtaLabel={t('home.empty.browseBooks')}
        onEmptyCtaPress={() => router.push('/(tabs)/search')}
      />

      {/* Popular now */}
      <HorizontalBookList
        title={t('home.sections.popularNow')}
        items={toBookItems(popularItems)}
        loading={loadingBooks}
        emptyText={t('home.empty.forYou')}
        emptyCtaLabel={t('home.empty.browseBooks')}
        onEmptyCtaPress={() => router.push('/(tabs)/search')}
      />

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    // paddingTop set inline from safe-area inset below.
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  greetingCol: {
    flex: 1,
    minWidth: 0,
  },
  greetingPrimary: {
    fontFamily: fonts.serif,
    fontSize: 26,
    lineHeight: 32,
  },
  greetingSecondary: {
    fontFamily: fonts.serifItalic,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  onlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  langPillText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
  },
  streakText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
  streakSub: {
    fontFamily: fonts.sans,
    fontSize: 12,
  },
})
