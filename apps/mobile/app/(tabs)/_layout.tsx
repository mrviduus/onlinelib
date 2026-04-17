import { useEffect, useRef } from 'react'
import { Tabs } from 'expo-router'
import { Platform, Animated } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../src/context/ThemeContext'
import { useLanguage } from '../../src/context/LanguageContext'
import { typography } from '../../src/theme/typography'

function AnimatedTabIcon({ name, size, color, focused }: {
  name: keyof typeof Ionicons.glyphMap; size: number; color: string; focused: boolean
}) {
  const scale = useRef(new Animated.Value(1)).current
  useEffect(() => {
    if (focused) {
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.15, useNativeDriver: true, tension: 100, friction: 8 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }),
      ]).start()
    }
  }, [focused])
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  )
}

const TAB_ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Read:       { active: 'book', inactive: 'book-outline' },
  Discover:   { active: 'compass', inactive: 'compass-outline' },
  Library:    { active: 'library', inactive: 'library-outline' },
  Vocabulary: { active: 'school', inactive: 'school-outline' },
  Profile:    { active: 'person', inactive: 'person-outline' },
}

export default function TabLayout() {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const insets = useSafeAreaInsets()

  // On iOS the old hardcoded 88 already approximated the home-indicator
  // safe area. On Android the 60 didn't account for 3-button nav bars or
  // gesture bars, so icons overlapped the system UI (B-13). Use real
  // insets on both platforms — iOS keeps parity, Android gains padding.
  const baseHeight = Platform.OS === 'ios' ? 52 : 56
  const tabBarHeight = baseHeight + insets.bottom

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.background,
          paddingTop: 4,
          paddingBottom: insets.bottom,
          height: tabBarHeight,
        },
        tabBarLabelStyle: typography.tabLabel,
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { ...typography.h3, color: colors.text },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.read'),
          headerShown: false,
          tabBarIcon: ({ focused, color }) => (
            <AnimatedTabIcon name={focused ? TAB_ICONS.Read.active : TAB_ICONS.Read.inactive} size={22} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: t('nav.discover'),
          tabBarIcon: ({ focused, color }) => (
            <AnimatedTabIcon name={focused ? TAB_ICONS.Discover.active : TAB_ICONS.Discover.inactive} size={22} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: t('nav.library'),
          tabBarIcon: ({ focused, color }) => (
            <AnimatedTabIcon name={focused ? TAB_ICONS.Library.active : TAB_ICONS.Library.inactive} size={22} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="vocabulary"
        options={{
          title: t('nav.vocabulary'),
          tabBarIcon: ({ focused, color }) => (
            <AnimatedTabIcon name={focused ? TAB_ICONS.Vocabulary.active : TAB_ICONS.Vocabulary.inactive} size={22} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('nav.profile'),
          tabBarIcon: ({ focused, color }) => (
            <AnimatedTabIcon name={focused ? TAB_ICONS.Profile.active : TAB_ICONS.Profile.inactive} size={22} color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  )
}
