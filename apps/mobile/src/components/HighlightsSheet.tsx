import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, FlatList } from 'react-native'
import { isPdfAnchor } from '@textstack/shared'
import type { PublicHighlight } from '@textstack/shared'
import { useTheme } from '../context/ThemeContext'
import { fonts } from '../theme/typography'

/** Swatch fills — mirror the reader highlight palette (HighlightNoteModal). */
const COLOR_FILL: Record<string, string> = {
  yellow: '#fef08a',
  green: '#bbf7d0',
  pink: '#fbcfe8',
  blue: '#bfdbfe',
}

/** Position key for sorting — PDF: page + top-most rect y; reflow: text offset. */
function sortKey(h: PublicHighlight): { page: number | null; y: number; offset: number | null } {
  try {
    const anchor = JSON.parse(h.anchorJson)
    if (isPdfAnchor(anchor)) {
      const y = anchor.rects.length ? Math.min(...anchor.rects.map(r => r.y)) : 0
      return { page: anchor.page, y, offset: null }
    }
    // Reflow anchors are {prefix, exact, suffix}; a numeric offset is only
    // present on some payloads — use it when available, else fall back to newest.
    const off = typeof anchor?.startOffset === 'number' ? anchor.startOffset : null
    return { page: null, y: 0, offset: off }
  } catch {
    return { page: null, y: 0, offset: null }
  }
}

/** Sort by position (reflow: offset; PDF: page then rect y; fallback newest). */
function sortHighlights(list: PublicHighlight[]): PublicHighlight[] {
  return [...list].sort((a, b) => {
    const ka = sortKey(a)
    const kb = sortKey(b)
    if (ka.page != null && kb.page != null) {
      if (ka.page !== kb.page) return ka.page - kb.page
      return ka.y - kb.y
    }
    if (ka.offset != null && kb.offset != null) return ka.offset - kb.offset
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

/** Snippet — selectedText, else the anchor's `exact`, truncated. */
function snippetOf(h: PublicHighlight): string {
  let text = h.selectedText
  if (!text) {
    try {
      const anchor = JSON.parse(h.anchorJson)
      text = typeof anchor?.exact === 'string' ? anchor.exact : ''
    } catch { text = '' }
  }
  text = text.trim()
  return text.length > 120 ? text.slice(0, 120) + '…' : text
}

/** 1-based PDF page for a highlight, or null for a reflow highlight. */
function pdfPageOf(h: PublicHighlight): number | null {
  try {
    const anchor = JSON.parse(h.anchorJson)
    return isPdfAnchor(anchor) ? anchor.page : null
  } catch {
    return null
  }
}

interface Props {
  visible: boolean
  onClose: () => void
  highlights: PublicHighlight[]
  /** Chapter slug reflow highlights jump to (the loaded set is current-chapter). */
  currentChapterSlug: string
  /** Reflow jump — same handler bookmarks use. Fallback when scroll-to isn't wired. */
  onNavigate: (chapterSlug: string) => void
  /** Reflow in-chapter scroll to the highlight's DOM range (M2). Preferred over
   *  onNavigate: the loaded set is the current chapter, so this centers the
   *  highlight WITHOUT resetting the reader's scroll position/progress. */
  onScrollToHighlight?: (anchorJson: string) => void
  /** Original-layout PDF jump to a 1-based page — same handler page bookmarks use. */
  onNavigatePage?: (page: number) => void
}

/**
 * In-reader, per-book highlights list — parallel to BookmarksSheet. Read-only:
 * tapping a row jumps to the highlight (reflow → chapter, PDF → page) and closes
 * the sheet. Recolor / note / delete stay in HighlightNoteModal (tap the painted
 * highlight in the text). The list is the reader's live highlight set — the
 * current chapter for reflow, book-wide PDF anchors for the Original PDF reader.
 */
export function HighlightsSheet({
  visible, onClose, highlights, currentChapterSlug, onNavigate, onScrollToHighlight, onNavigatePage,
}: Props) {
  const { colors } = useTheme()
  const data = sortHighlights(highlights)

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close highlights"
      >
        <Pressable style={[styles.sheet, { backgroundColor: colors.background }]} onPress={e => e.stopPropagation()}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12 }} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">Highlights</Text>
          </View>

          {data.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>No highlights yet</Text>
          ) : (
            <FlatList
              data={data}
              keyExtractor={item => item.id}
              style={styles.list}
              renderItem={({ item }) => {
                const page = pdfPageOf(item)
                const go = () => {
                  if (page != null) {
                    // PDF: jump to the highlight's page.
                    onNavigatePage?.(page)
                  } else if (onScrollToHighlight) {
                    // Reflow: scroll to it in-place (M2) — the list is the
                    // current chapter, so this never resets reading position.
                    onScrollToHighlight(item.anchorJson)
                  } else {
                    // Fallback (scroll-to not wired): navigate to the chapter.
                    onNavigate(currentChapterSlug)
                  }
                  onClose()
                }
                const fill = COLOR_FILL[item.color] || COLOR_FILL.yellow
                return (
                  <TouchableOpacity
                    style={[styles.row, { borderBottomColor: colors.border }]}
                    onPress={go}
                    accessibilityRole="button"
                    accessibilityLabel={`Go to highlight: ${snippetOf(item)}`}
                  >
                    <View style={[styles.swatch, { backgroundColor: fill }]} />
                    <View style={styles.rowContent}>
                      <Text style={[styles.rowText, { color: colors.text }]} numberOfLines={2}>
                        {snippetOf(item)}
                      </Text>
                      {item.noteText ? (
                        <Text style={[styles.rowNote, { color: colors.textSecondary }]} numberOfLines={1}>
                          {item.noteText}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                )
              }}
            />
          )}

          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: colors.primary }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close highlights"
          >
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
  empty: { fontSize: 14, textAlign: 'center', marginVertical: 20 },
  list: { maxHeight: 300 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 3,
    marginRight: 12,
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  rowContent: { flex: 1 },
  rowText: { fontSize: 15 },
  rowNote: { fontSize: 12, marginTop: 3, fontStyle: 'italic' },
  closeBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontFamily: fonts.sansBold },
})
