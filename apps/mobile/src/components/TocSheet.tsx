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

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 12 }} />
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text }]}>Contents</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <FlatList
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
            getItemLayout={(_, index) => ({ length: 52, offset: 52 * index, index })}
            initialScrollIndex={Math.max(0, chapters.findIndex(c => c.slug === currentChapterSlug) - 2)}
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
