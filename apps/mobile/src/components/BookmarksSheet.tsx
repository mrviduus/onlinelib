import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, FlatList } from 'react-native'
import type { BookmarkDto } from '@textstack/shared'
import { colors } from '../theme/colors'

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
  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Bookmarks</Text>
            <TouchableOpacity style={styles.addBtn} onPress={onToggleCurrent}>
              <Text style={styles.addBtnText}>
                {isCurrentBookmarked ? 'Remove Bookmark' : 'Bookmark This Chapter'}
              </Text>
            </TouchableOpacity>
          </View>

          {bookmarks.length === 0 ? (
            <Text style={styles.empty}>No bookmarks yet</Text>
          ) : (
            <FlatList
              data={bookmarks}
              keyExtractor={item => item.id}
              style={styles.list}
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <TouchableOpacity
                    style={styles.rowContent}
                    onPress={() => { onNavigate(item.chapterSlug); onClose() }}
                  >
                    <Text style={[
                      styles.rowTitle,
                      item.chapterSlug === currentChapterSlug && styles.rowTitleActive,
                    ]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.rowDate}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(item.id)}>
                    <Text style={styles.deleteText}>X</Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          )}

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
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
    backgroundColor: colors.background,
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
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  addBtn: {
    backgroundColor: colors.primaryLight,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  addBtnText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  empty: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginVertical: 20 },
  list: { maxHeight: 300 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 15, color: colors.text },
  rowTitleActive: { color: colors.primary, fontWeight: '600' },
  rowDate: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  deleteBtn: { padding: 8 },
  deleteText: { fontSize: 14, color: '#DC2626', fontWeight: '600' },
  closeBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})
