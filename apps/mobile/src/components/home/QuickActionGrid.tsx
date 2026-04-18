/**
 * 4-square quick action grid for the home screen.
 *
 * Mirrors ElevenReader's "Add to your library" 2x2 grid but reframed
 * around reading rather than TTS. The Scan / Paste-link tiles surface
 * future capabilities as "Coming soon" so the grid looks full without
 * shipping the features yet.
 *
 * Layout: 2 columns x 2 rows, tile width = (screen - padding - gap) / 2.
 */

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { fonts } from '../../theme/typography'

interface Props {
  onBrowse: () => void
  onUpload: () => void
  onPasteLink?: () => void // optional - falls back to a "coming soon" alert
  onScan?: () => void // optional - falls back to a "coming soon" alert
}

export function QuickActionGrid({
  onBrowse,
  onUpload,
  onPasteLink,
  onScan,
}: Props) {
  const { colors } = useTheme()
  const { language, t } = useLanguage()

  const comingSoon = (actionName: string) => {
    Alert.alert(
      actionName,
      t('home.quickActions.pasteUrlComingSoon'),
      [{ text: 'OK' }],
    )
  }

  const handlePasteLink = () => {
    if (onPasteLink) onPasteLink()
    else comingSoon(t('home.quickActions.pasteLink'))
  }
  const handleScan = () => {
    if (onScan) onScan()
    else comingSoon(t('home.quickActions.scanText'))
  }

  const tiles = [
    {
      key: 'browse',
      icon: 'library-outline' as const,
      label: t('home.quickActions.browse'),
      sub: t('home.quickActions.browseSub'),
      onPress: onBrowse,
      comingSoon: false,
    },
    {
      key: 'upload',
      icon: 'cloud-upload-outline' as const,
      label: t('home.quickActions.upload'),
      sub: t('home.quickActions.uploadSub'),
      onPress: onUpload,
      comingSoon: false,
    },
    {
      key: 'paste',
      icon: 'link-outline' as const,
      label: t('home.quickActions.pasteLink'),
      sub: t('home.quickActions.pasteLinkSub'),
      onPress: handlePasteLink,
      comingSoon: !onPasteLink,
    },
    {
      key: 'scan',
      icon: 'scan-outline' as const,
      label: t('home.quickActions.scanText'),
      sub: t('home.quickActions.scanTextSub'),
      onPress: handleScan,
      comingSoon: !onScan,
    },
  ]

  // suppress unused `language` warning — kept so the component re-renders on lang switch
  void language

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.text }]}>
        {t('home.quickActions.title')}
      </Text>
      <View style={styles.grid}>
        {tiles.map((tile) => (
          <TouchableOpacity
            key={tile.key}
            style={[
              styles.tile,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: tile.comingSoon ? 0.75 : 1,
              },
            ]}
            onPress={tile.onPress}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={tile.label}
            accessibilityHint={tile.sub}
            accessibilityState={tile.comingSoon ? { disabled: true } : undefined}
          >
            <View
              style={[
                styles.iconBubble,
                { backgroundColor: colors.primaryLight },
              ]}
            >
              <Ionicons name={tile.icon} size={20} color={colors.primary} />
            </View>
            <Text
              style={[styles.tileLabel, { color: colors.text }]}
              numberOfLines={1}
            >
              {tile.label}
            </Text>
            <Text
              style={[styles.tileSub, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {tile.sub}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

const TILE_GAP = 12

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 18,
    lineHeight: 24,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  tile: {
    // Two tiles per row. flexBasis computed as "50% minus half the gap"
    // via a fixed minWidth so RN's flex wrap kicks in cleanly.
    flexGrow: 1,
    flexBasis: '47%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    minHeight: 96,
    justifyContent: 'space-between',
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  tileLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  tileSub: {
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
})
