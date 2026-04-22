import { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useTheme } from '../context/ThemeContext'
import { fonts } from '../theme/typography'

export interface HighlightNoteModalProps {
  visible: boolean
  /** Short snippet of the highlighted passage rendered above the input. */
  snippet: string
  /** Existing note, prefilled into the text field when present. */
  initialNote?: string | null
  onCancel: () => void
  onSave: (note: string) => void
  onDelete: () => void
}

/**
 * Cross-platform replacement for `Alert.prompt`, which only exists on iOS.
 * On Android the old call silently failed — users could neither edit nor
 * delete a highlight note (B-02).
 *
 * Design notes:
 *  - Kept visually aligned with `BookmarksSheet` (slide-up sheet, themed
 *    surface) so it feels native in context.
 *  - Uses `KeyboardAvoidingView` so the input isn't hidden by the keyboard
 *    on small phones.
 *  - Resets draft text whenever the modal reopens with a different note,
 *    avoiding stale-state bugs when editing two highlights in sequence.
 */
export function HighlightNoteModal({
  visible,
  snippet,
  initialNote,
  onCancel,
  onSave,
  onDelete,
}: HighlightNoteModalProps) {
  const { colors } = useTheme()
  const [note, setNote] = useState(initialNote || '')
  const inputRef = useRef<TextInput>(null)

  useEffect(() => {
    if (visible) {
      setNote(initialNote || '')
    }
  }, [visible, initialNote])

  // Auto-focus the input shortly after mount so the keyboard comes up
  // without requiring a second tap. setTimeout avoids a race with the
  // Modal's open animation on iOS.
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => inputRef.current?.focus(), 150)
    return () => clearTimeout(t)
  }, [visible])

  const handleSave = () => onSave(note.trim())

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <Pressable
          style={styles.backdrop}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Close highlight note"
        >
          <Pressable
            style={[styles.card, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={e => e.stopPropagation()}
          >
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">Highlight Note</Text>
            {snippet ? (
              <Text style={[styles.snippet, { color: colors.textSecondary }]} numberOfLines={3}>
                "{snippet}"
              </Text>
            ) : null}

            <TextInput
              ref={inputRef}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note…"
              placeholderTextColor={colors.textSecondary}
              multiline
              accessibilityLabel="Highlight note"
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost]}
                onPress={onDelete}
                accessibilityRole="button"
                accessibilityLabel="Delete highlight"
              >
                <Text style={[styles.btnText, { color: colors.error }]}>Delete</Text>
              </TouchableOpacity>
              <View style={styles.spacer} />
              <TouchableOpacity
                style={[styles.btn, styles.btnGhost]}
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={[styles.btnText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                accessibilityRole="button"
                accessibilityLabel="Save note"
              >
                <Text style={[styles.btnText, { color: '#fff' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.sansBold,
    marginBottom: 6,
  },
  snippet: {
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  btnGhost: {},
  btnPrimary: {},
  btnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  spacer: { flex: 1 },
})
