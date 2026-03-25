import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, FlatList } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { BookmarkDto } from '@textstack/shared'
import { useTheme } from '../context/ThemeContext'
import { fonts } from '../theme/typography'

function getSlugFromLocator(locator: string): string {
  return locator.startsWith('chapter:') ? locator.slice(8) : locator
}

interface Props {
  visible: boolean
  onClose: () => void
  bookmarks: BookmarkDto[]
  currentChapterSlug: string
  onNavigate: (chapterSlug: string) => void
  onDelete: (id: string) => void
  onToggleCurrent: () => void
  isCurrentBookmarked: boolean
}

export function BookmarksSheet({
  visible, onClose, bookmarks, currentChapterSlug,
  onNavigate, onDelete, onToggleCurrent, isCurrentBookmarked,
}: Props) {
  const { colors } = useTheme()

  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.background }]} onPress={e => e.stopPropagation()}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: 12 }} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Bookmarks</Text>
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primaryLight }]} onPress={onToggleCurrent}>
              <Text style={[styles.addBtnText, { color: colors.primary }]}>
                {isCurrentBookmarked ? 'Remove Bookmark' : 'Bookmark This Chapter'}
              </Text>
            </TouchableOpacity>
          </View>

          {bookmarks.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>No bookmarks yet</Text>
          ) : (
            <FlatList
              data={bookmarks}
              keyExtractor={item => item.id}
              style={styles.list}
              renderItem={({ item }) => (
                <View style={[styles.row, { borderBottomColor: colors.border }]}>
                  <TouchableOpacity
                    style={styles.rowContent}
                    onPress={() => { onNavigate(getSlugFromLocator(item.locator)); onClose() }}
                  >
                    <Text style={[
                      styles.rowTitle,
                      { color: colors.text },
                      getSlugFromLocator(item.locator) === currentChapterSlug && { color: colors.primary, fontWeight: '600' },
                    ]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.rowDate, { color: colors.textSecondary }]}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(item.id)}>
                    <Ionicons name="close" size={18} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              )}
            />
          )}

          <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.primary }]} onPress={onClose}>
            <Text style={styles.closeBtnText}>Done</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 18, fontFamily: fonts.sansBold },
  addBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  addBtnText: { fontSize: 12, fontFamily: fonts.sansBold },
  empty: { fontSize: 14, textAlign: 'center', marginVertical: 20 },
  list: { maxHeight: 300 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 15 },
  rowDate: { fontSize: 11, marginTop: 2 },
  deleteBtn: { padding: 8 },
  closeBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontFamily: fonts.sansBold },
})
