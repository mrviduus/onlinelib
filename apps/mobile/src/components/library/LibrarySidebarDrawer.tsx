import { useEffect, useRef } from 'react'
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { fonts } from '../../theme/typography'
import { useCollections } from '../../hooks/useCollections'

export type LibrarySource = 'all' | 'uploads' | 'catalog'

interface Props {
  visible: boolean
  source: LibrarySource
  counts: { all: number; uploads: number; catalog: number }
  activeCollectionId: string | null
  onSelect: (next: LibrarySource) => void
  onCollectionSelect: (id: string | null) => void
  onClose: () => void
}

const DRAWER_WIDTH = 280

export function LibrarySidebarDrawer({ visible, source, counts, activeCollectionId, onSelect, onCollectionSelect, onClose }: Props) {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const { collections } = useCollections()
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
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {items.map((item) => {
            const active = source === item.key && !activeCollectionId
            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.item,
                  active && { backgroundColor: colors.primaryLight },
                ]}
                onPress={() => { onSelect(item.key); onCollectionSelect(null); onClose() }}
              >
                <Ionicons name={item.icon} size={18} color={active ? colors.primary : colors.textSecondary} />
                <Text style={[styles.label, { color: active ? colors.primary : colors.text }]} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text style={[styles.count, { color: colors.textSecondary }]}>{item.count}</Text>
              </TouchableOpacity>
            )
          })}

          {collections.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
                {t('library.sidebar.collections').toUpperCase()}
              </Text>
              {collections.map((c) => {
                const active = activeCollectionId === c.id
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.item, active && { backgroundColor: colors.primaryLight }]}
                    onPress={() => { onCollectionSelect(active ? null : c.id); onClose() }}
                  >
                    <Ionicons name="folder-outline" size={18} color={active ? colors.primary : colors.textSecondary} />
                    <Text style={[styles.label, { color: active ? colors.primary : colors.text }]} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={[styles.count, { color: colors.textSecondary }]}>{c.count}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </ScrollView>
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
  sectionHeading: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
    letterSpacing: 0.6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
})
