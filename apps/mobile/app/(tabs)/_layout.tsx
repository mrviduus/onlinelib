import { Tabs } from 'expo-router'
import { View, Text, StyleSheet, Platform } from 'react-native'
import { colors } from '../../src/theme/colors'

const TAB_ICONS: Record<string, { active: string; inactive: string }> = {
  Home:    { active: '📚', inactive: '📚' },
  Search:  { active: '🔍', inactive: '🔍' },
  Library: { active: '📖', inactive: '📖' },
  Profile: { active: '👤', inactive: '👤' },
}

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icon = TAB_ICONS[name] || { active: '📄', inactive: '📄' }
  return (
    <View style={styles.iconContainer}>
      <Text style={[styles.icon, { opacity: focused ? 1 : 0.45 }]}>
        {focused ? icon.active : icon.inactive}
      </Text>
      {focused && <View style={styles.dot} />}
    </View>
  )
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        headerShown: true,
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon name="Home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ focused }) => <TabIcon name="Search" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ focused }) => <TabIcon name="Library" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon name="Profile" focused={focused} />,
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    paddingTop: 4,
    height: Platform.OS === 'ios' ? 88 : 60,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 22,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
    marginTop: 2,
  },
})
