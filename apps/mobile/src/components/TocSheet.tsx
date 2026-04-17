import { useRef } from 'react'
import { View, Text, Modal, TouchableOpacity, FlatList, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'
import { fonts } from '../theme/typography'

interface TocChapter {
  slug: string
  title: string
  chapterNumber?: number
}

interface TocSheetProps {
  visible: boolean
  chapters: TocChapter[]
  currentChapterSlug: string
  bookmarks?: Array<{ chapterSlug: string; title?: string }>
  onNavigate: (slug: string) => void
  onClose: () => void
}

export function TocSheet({ visible, chapters, currentChapterSlug, bookmarks, onNavigate, onClose }: TocSheetProps) {
  const { colors } = useTheme()
  const listRef = useRef<FlatList<TocChapter>>(null)

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 12 }} />
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">Contents</Text>
            <TouchableOpacity
              onPress={onClose}
              style={{ padding: 4 }}
              accessibilityRole="button"
              accessibilityLabel="Close table of contents"
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <FlatList
            ref={listRef}
            data={chapters}
            keyExtractor={(item) => item.slug}
            renderItem={({ item, index }) => {
              const isCurrent = item.slug === currentChapterSlug
              const hasBookmark = bookmarks?.some(b => b.chapterSlug === item.slug)
              return (
                <TouchableOpacity
                  style={[
                    styles.row,
                    { borderBottomColor: colors.border },
                    isCurrent && { backgroundColor: colors.primaryLight },
                  ]}
                  onPress={() => { onNavigate(item.slug); onClose() }}
                  accessibilityRole="button"
                  accessibilityLabel={`Chapter ${index + 1}: ${item.title}${hasBookmark ? ', bookmarked' : ''}`}
                  accessibilityState={{ selected: isCurrent }}
                >
                  <Text style={[styles.chapterNum, { color: colors.textSecondary }]}>{index + 1}</Text>
                  <Text style={[
                    styles.chapterTitle,
                    { color: colors.text },
                    isCurrent && { fontFamily: fonts.sansBold, color: colors.primary },
                  ]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {hasBookmark && <Ionicons name="bookmark" size={14} color={colors.primary} style={{ marginLeft: 8 }} />}
                </TouchableOpacity>
              )
            }}
            style={styles.list}
            // getItemLayout was lying — rows with numberOfLines={2} are
            // taller than 52 whenever the title wraps, which threw
            // initialScrollIndex offsets off by a growing amount and
            // produced blank sections at the bottom (B-14). Dropping it
            // lets FlatList measure; onScrollToIndexFailed handles the
            // edge where the target hasn't been laid out yet.
            initialScrollIndex={Math.max(0, chapters.findIndex(c => c.slug === currentChapterSlug) - 2)}
            onScrollToIndexFailed={info => {
              // Two-step recovery (P2-1): first jump to the approximate
              // offset so FlatList renders the target region, then retry
              // the exact index once layout has settled. Without the
              // retry the sheet lands a few rows above the current
              // chapter on first open.
              const approxOffset = info.averageItemLength * info.index
              listRef.current?.scrollToOffset({ offset: approxOffset, animated: false })
              setTimeout(() => {
                try {
                  listRef.current?.scrollToIndex({ index: info.index, animated: false })
                } catch {
                  /* sheet closed or list unmounted — ignore */
                }
              }, 100)
            }}
          />
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontFamily: fonts.sansBold },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    height: 52,
  },
  chapterNum: {
    width: 28,
    fontSize: 13,
    fontFamily: fonts.sansMedium,
  },
  chapterTitle: {
    flex: 1,
    fontSize: 14,
  },
})
