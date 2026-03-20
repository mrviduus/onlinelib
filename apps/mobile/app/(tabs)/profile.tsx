import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/context/AuthContext'
import { useTheme } from '../../src/context/ThemeContext'
import { fonts } from '../../src/theme/typography'

const MENU_ITEMS = [
  { label: 'Reading Stats', icon: 'stats-chart-outline' as const, route: '/stats/' },
  { label: 'Vocabulary', icon: 'book-outline' as const, route: '/vocabulary/' },
]

export default function ProfileScreen() {
  const { user, isAuthenticated, signOut } = useAuth()
  const { colors } = useTheme()
  const router = useRouter()

  if (!isAuthenticated) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="person-circle-outline" size={64} color={colors.border} />
        <Text style={[styles.title, { color: colors.text }]}>Profile</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Sign in to track your reading</Text>
        <TouchableOpacity
          style={[styles.loginButton, { backgroundColor: colors.primary }]}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.loginText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View style={[styles.avatarWrapper, { backgroundColor: colors.primary }]}>
          {user?.picture ? (
            <Image source={user.picture} style={styles.avatar} contentFit="cover" />
          ) : (
            <Text style={styles.avatarLetter}>
              {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <Text style={[styles.name, { color: colors.text }]}>{user?.name || user?.email}</Text>
        <Text style={[styles.email, { color: colors.textSecondary }]}>{user?.email}</Text>
      </View>

      <View style={styles.menu}>
        {MENU_ITEMS.map(item => (
          <TouchableOpacity
            key={item.route}
            style={[styles.menuItem, { borderBottomColor: colors.border }]}
            onPress={() => router.push(item.route)}
            activeOpacity={0.7}
          >
            <Ionicons name={item.icon} size={20} color={colors.textSecondary} style={styles.menuIcon} />
            <Text style={[styles.menuText, { color: colors.text }]}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          style={[styles.menuItem, { borderBottomColor: 'transparent', marginTop: 24 }]}
          onPress={signOut}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.error} style={styles.menuIcon} />
          <Text style={[styles.menuText, { color: colors.error }]}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  container: { flex: 1 },
  title: { fontFamily: fonts.serifBold, fontSize: 22, marginTop: 8 },
  subtitle: { fontFamily: fonts.sans, fontSize: 14 },
  loginButton: {
    marginTop: 12,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 10,
  },
  loginText: { color: '#fff', fontFamily: fonts.sansMedium, fontSize: 15 },
  header: { alignItems: 'center', paddingVertical: 32 },
  avatarWrapper: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    overflow: 'hidden',
  },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarLetter: { color: '#fff', fontFamily: fonts.serifBold, fontSize: 36 },
  name: { fontFamily: fonts.serifBold, fontSize: 20 },
  email: { fontFamily: fonts.sans, fontSize: 14, marginTop: 4 },
  menu: { paddingHorizontal: 16, marginTop: 16 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  menuIcon: { marginRight: 12 },
  menuText: { flex: 1, fontFamily: fonts.sans, fontSize: 16 },
})
