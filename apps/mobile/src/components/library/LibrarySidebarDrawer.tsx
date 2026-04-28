import { useEffect, useRef } from 'react'
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { fonts } from '../../theme/typography'

export type LibrarySource = 'all' | 'uploads' | 'catalog'

interface Props {
  visible: boolean
  source: LibrarySource
  counts: { all: number; uploads: number; catalog: number }
  onSelect: (next: LibrarySource) => void
  onClose: () => void
}

const DRAWER_WIDTH = 280

export function LibrarySidebarDrawer({ visible, source, counts, onSelect, onClose }: Props) {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const slide = useRef(new Animated.Value(-DRAWER_WIDTH)).current

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 0 : -DRAWER_WIDTH,
      duration: 200,
      useNativeDriver: true,
    }).start()
  }, [visible, slide])

  const items: Array<{ key: LibrarySource; icon: keyof typeof Ionicons.glyphMap; label: string; count: number }> = [
    { key: 'all', icon: 'book-outline', label: t('library.sidebar.all'), count: counts.all },
    { key: 'uploads', icon: 'cloud-upload-outline', label: t('library.sidebar.uploads'), count: counts.uploads },
    { key: 'catalog', icon: 'bookmark-outline', label: t('library.sidebar.catalog'), count: counts.catalog },
  ]

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View
        style={[
          styles.drawer,
          { backgroundColor: colors.background, transform: [{ translateX: slide }] },
        ]}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{t('library.title')}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        {items.map((item) => {
          const active = source === item.key
          return (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.item,
                active && { backgroundColor: colors.primaryLight },
              ]}
              onPress={() => { onSelect(item.key); onClose() }}
            >
              <Ionicons name={item.icon} size={18} color={active ? colors.primary : colors.textSecondary} />
              <Text style={[styles.label, { color: active ? colors.primary : colors.text }]} numberOfLines={1}>
                {item.label}
              </Text>
              <Text style={[styles.count, { color: colors.textSecondary }]}>{item.count}</Text>
            </TouchableOpacity>
          )
        })}
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  drawer: {
    position: 'absolute', top: 0, left: 0, bottom: 0, width: DRAWER_WIDTH,
    paddingTop: 50, paddingHorizontal: 12,
    shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingBottom: 16,
  },
  title: { fontFamily: fonts.serifBold, fontSize: 20 },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, marginBottom: 4,
  },
  label: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 15 },
  count: { fontFamily: fonts.sans, fontSize: 13 },
})
