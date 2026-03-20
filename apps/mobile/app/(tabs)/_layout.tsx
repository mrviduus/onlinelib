import { Tabs } from 'expo-router'
import { Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../src/context/ThemeContext'
import { typography } from '../../src/theme/typography'

const TAB_ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Home:    { active: 'home', inactive: 'home-outline' },
  Search:  { active: 'search', inactive: 'search-outline' },
  Library: { active: 'library', inactive: 'library-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
}

export default function TabLayout() {
  const { colors } = useTheme()

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
          height: Platform.OS === 'ios' ? 88 : 60,
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
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? TAB_ICONS.Home.active : TAB_ICONS.Home.inactive} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? TAB_ICONS.Search.active : TAB_ICONS.Search.inactive} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? TAB_ICONS.Library.active : TAB_ICONS.Library.inactive} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons name={focused ? TAB_ICONS.Profile.active : TAB_ICONS.Profile.inactive} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  )
}
