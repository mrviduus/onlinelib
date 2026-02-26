import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native'
import { colors } from '../theme/colors'
import type { ReaderSettings } from '../hooks/useReaderSettings'
import { themeStyles } from '../hooks/useReaderSettings'

interface Props {
  visible: boolean
  onClose: () => void
  settings: ReaderSettings
  onUpdate: (patch: Partial<ReaderSettings>) => void
}

const fontSizes = [14, 16, 18, 20, 22, 24, 26, 28]
const lineHeights = [1.4, 1.65, 1.8]
const fonts: { key: ReaderSettings['fontFamily']; label: string }[] = [
  { key: 'serif', label: 'Serif' },
  { key: 'sans', label: 'Sans' },
  { key: 'system', label: 'System' },
]
const themes: { key: ReaderSettings['theme']; label: string }[] = [
  { key: 'light', label: 'Light' },
  { key: 'sepia', label: 'Sepia' },
  { key: 'dark', label: 'Dark' },
]

export function ReaderSettingsDrawer({ visible, onClose, settings, onUpdate }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.drawer} onPress={e => e.stopPropagation()}>
          <Text style={styles.title}>Reader Settings</Text>

          {/* Font Size */}
          <Text style={styles.label}>Font Size: {settings.fontSize}px</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.sizeButton}
              onPress={() => onUpdate({ fontSize: Math.max(14, settings.fontSize - 2) })}
            >
              <Text style={styles.sizeText}>A-</Text>
            </TouchableOpacity>
            <View style={styles.sizePreview}>
              <Text style={{ fontSize: settings.fontSize }}>Aa</Text>
            </View>
            <TouchableOpacity
              style={styles.sizeButton}
              onPress={() => onUpdate({ fontSize: Math.min(28, settings.fontSize + 2) })}
            >
              <Text style={styles.sizeText}>A+</Text>
            </TouchableOpacity>
          </View>

          {/* Line Height */}
          <Text style={styles.label}>Line Height</Text>
          <View style={styles.row}>
            {lineHeights.map(lh => (
              <TouchableOpacity
                key={lh}
                style={[styles.chip, settings.lineHeight === lh && styles.chipActive]}
                onPress={() => onUpdate({ lineHeight: lh })}
              >
                <Text style={[styles.chipText, settings.lineHeight === lh && styles.chipTextActive]}>
                  {lh === 1.4 ? 'Tight' : lh === 1.65 ? 'Normal' : 'Loose'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Font Family */}
          <Text style={styles.label}>Font</Text>
          <View style={styles.row}>
            {fonts.map(f => (
              <TouchableOpacity
                key={f.key}
                style={[styles.chip, settings.fontFamily === f.key && styles.chipActive]}
                onPress={() => onUpdate({ fontFamily: f.key })}
              >
                <Text style={[styles.chipText, settings.fontFamily === f.key && styles.chipTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Theme */}
          <Text style={styles.label}>Theme</Text>
          <View style={styles.row}>
            {themes.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[
                  styles.themeChip,
                  { backgroundColor: themeStyles[t.key].backgroundColor },
                  settings.theme === t.key && styles.themeChipActive,
                ]}
                onPress={() => onUpdate({ theme: t.key })}
              >
                <Text style={[styles.themeText, { color: themeStyles[t.key].textColor }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Done</Text>
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
  drawer: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 8, marginTop: 16 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  sizeButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sizeText: { fontSize: 16, fontWeight: '600', color: colors.text },
  sizePreview: { flex: 1, alignItems: 'center' },
  chip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.surface,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: { fontSize: 14, color: colors.text, fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  themeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  themeChipActive: { borderColor: colors.primary },
  themeText: { fontSize: 14, fontWeight: '500' },
  closeButton: {
    marginTop: 24,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})
