import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../context/ThemeContext'
import { fonts } from '../../theme/typography'
import { PressableScale } from '../ui/PressableScale'
import type { LibrarianRecommendation } from '../../lib/agents'

interface Props {
  index: number
  rec: LibrarianRecommendation
  t: (key: string) => string
  onOpen: (slug: string) => void
}

// A single ranked recommendation. Two visually-distinct treatments:
//  - `library` (has a slug) → a tappable card that navigates into the catalog book page.
//  - `open_library`         → a clearly-marked "suggestion, not in your library yet" card with NO navigation.
// `title`/`why`/`authors` come straight from the model — `numberOfLines` bounds their height so an over-long
// string can't blow up the layout.
export function LibrarianRecommendationCard({ index, rec, t, onOpen }: Props) {
  const { colors } = useTheme()
  const isLibrary = rec.source === 'library' && !!rec.slug
  const authors = rec.authors.length > 0 ? rec.authors.join(', ') : t('librarian.unknownAuthor')

  const meta: string[] = []
  if (rec.year != null) meta.push(String(rec.year))
  if (rec.pages != null) meta.push(`${rec.pages} ${t('librarian.pages')}`)

  const body = (
    <>
      <View style={[styles.index, { backgroundColor: colors.primaryLight }]}>
        <Text style={[styles.indexText, { color: colors.primary, fontFamily: fonts.sansBold }]}>{index + 1}</Text>
      </View>
      <View style={styles.bodyText}>
        <View style={styles.head}>
          <Text style={[styles.title, { color: colors.text, fontFamily: fonts.serifBold }]} numberOfLines={1}>
            {rec.title}
          </Text>
          {!isLibrary && (
            <View style={[styles.badge, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.badgeText, { color: colors.textSecondary, fontFamily: fonts.sansMedium }]}>
                {t('librarian.suggestionBadge')}
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.authors, { color: colors.textSecondary, fontFamily: fonts.sans }]} numberOfLines={1}>
          {authors}
        </Text>
        {meta.length > 0 && (
          <Text style={[styles.meta, { color: colors.textSecondary, fontFamily: fonts.sans }]} numberOfLines={1}>
            {meta.join(' · ')}
          </Text>
        )}
        <Text style={[styles.why, { color: colors.text, fontFamily: fonts.sans }]} numberOfLines={3}>
          {rec.why}
        </Text>
        {!isLibrary ? (
          <Text style={[styles.suggestionNote, { color: colors.textSecondary, fontFamily: fonts.sans }]}>
            {t('librarian.suggestionNote')}
          </Text>
        ) : (
          <View style={styles.openRow}>
            <Text style={[styles.openText, { color: colors.primary, fontFamily: fonts.sansMedium }]}>
              {t('librarian.openBook')}
            </Text>
            <Ionicons name="arrow-forward" size={14} color={colors.primary} />
          </View>
        )}
      </View>
    </>
  )

  if (isLibrary) {
    return (
      <PressableScale
        onPress={() => onOpen(rec.slug!)}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
        accessibilityRole="button"
        accessibilityLabel={`${t('librarian.openBook')}: ${rec.title}`}
      >
        {body}
      </PressableScale>
    )
  }

  // External suggestion: NOT navigable — it doesn't exist in the catalog yet.
  return (
    <View
      style={[styles.card, styles.cardExternal, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityLabel={`${t('librarian.suggestionBadge')}: ${rec.title}`}
    >
      {body}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14 },
  cardExternal: { borderStyle: 'dashed' },
  index: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  indexText: { fontSize: 13 },
  bodyText: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  title: { fontSize: 18, flexShrink: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  badgeText: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  authors: { fontSize: 13, marginTop: 2 },
  meta: { fontSize: 12, marginTop: 2 },
  why: { fontSize: 14, lineHeight: 20, marginTop: 8 },
  suggestionNote: { fontSize: 12, marginTop: 8, fontStyle: 'italic' },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  openText: { fontSize: 13 },
})
