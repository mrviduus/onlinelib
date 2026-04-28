import { useEffect, useRef } from 'react'
import { Animated, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View, Linking } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { fonts } from '../../theme/typography'

interface Props {
  visible: boolean
  onClose: () => void
  onUpload: () => void
}

interface Item {
  key: string
  icon: keyof typeof Ionicons.glyphMap
  labelKey: string
  comingSoon?: boolean
  onPress?: () => void
}

const SHEET_MAX_HEIGHT = 420

export function AddMenuBottomSheet({ visible, onClose, onUpload }: Props) {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const router = useRouter()
  const slide = useRef(new Animated.Value(SHEET_MAX_HEIGHT)).current

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 0 : SHEET_MAX_HEIGHT,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }, [visible, slide])

  const handle = (cb?: () => void) => () => {
    onClose()
    cb?.()
  }

  const items: Array<Item | { divider: true; key: string }> = [
    { key: 'upload', icon: 'cloud-upload-outline', labelKey: 'addMenu.uploadFile', onPress: onUpload },
    { key: 'url', icon: 'link-outline', labelKey: 'addMenu.pasteUrl', comingSoon: true },
    { key: 'email', icon: 'mail-outline', labelKey: 'addMenu.emailBook', comingSoon: true },
    { key: 'd1', divider: true },
    {
      key: 'extension',
      icon: 'extension-puzzle-outline',
      labelKey: 'addMenu.browserExtension',
      onPress: () => Linking.openURL('https://chromewebstore.google.com').catch(() => {}),
    },
    { key: 'd2', divider: true },
    {
      key: 'browse',
      icon: 'book-outline',
      labelKey: 'addMenu.browseAll',
      onPress: () => router.push('/(tabs)/search'),
    },
  ]

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.background,
            transform: [{ translateY: slide }],
            borderTopColor: colors.border,
          },
        ]}
      >
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.text }]}>{t('addMenu.title')}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        {items.map((entry) => {
          if ('divider' in entry) {
            return <View key={entry.key} style={[styles.divider, { backgroundColor: colors.border }]} />
          }
          const disabled = !!entry.comingSoon
          return (
            <TouchableOpacity
              key={entry.key}
              style={styles.item}
              disabled={disabled}
              onPress={handle(entry.onPress)}
              activeOpacity={0.7}
              accessibilityRole="menuitem"
              accessibilityState={{ disabled }}
            >
              <Ionicons
                name={entry.icon}
                size={22}
                color={disabled ? colors.textSecondary : colors.text}
                style={{ opacity: disabled ? 0.55 : 1 }}
              />
              <Text
                style={[
                  styles.label,
                  {
                    color: disabled ? colors.textSecondary : colors.text,
                    fontStyle: disabled ? 'italic' : 'normal',
                  },
                ]}
              >
                {t(entry.labelKey)}
              </Text>
              {disabled && (
                <Text style={[styles.badge, { backgroundColor: colors.surface, color: colors.textSecondary }]}>
                  {t('addMenu.comingSoon')}
                </Text>
              )}
            </TouchableOpacity>
          )
        })}
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    paddingBottom: 32,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.18)',
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  title: { fontFamily: fonts.sansBold, fontSize: 16 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  label: { flex: 1, fontFamily: fonts.sansMedium, fontSize: 15 },
  divider: { height: 1, marginVertical: 4, marginHorizontal: 18 },
  badge: {
    fontFamily: fonts.sansMedium,
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
})
