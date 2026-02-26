import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { useAuth } from '../../src/context/AuthContext'
import { colors } from '../../src/theme/colors'

export default function ProfileScreen() {
  const { user, isAuthenticated, signOut } = useAuth()
  const router = useRouter()

  if (!isAuthenticated) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Profile</Text>
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.loginText}>Sign In</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {user?.picture && (
          <Image source={user.picture} style={styles.avatar} contentFit="cover" />
        )}
        <Text style={styles.name}>{user?.name || user?.email}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.menu}>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/stats/')}>
          <Text style={styles.menuText}>Reading Stats</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/vocabulary/')}>
          <Text style={styles.menuText}>Vocabulary</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.menuItem, styles.signOut]} onPress={signOut}>
          <Text style={[styles.menuText, { color: colors.error }]}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  title: { fontSize: 20, fontWeight: '600', color: colors.text, marginBottom: 16 },
  loginButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  loginText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  header: { alignItems: 'center', paddingVertical: 32 },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 12 },
  name: { fontSize: 18, fontWeight: '600', color: colors.text },
  email: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  menu: { paddingHorizontal: 16, marginTop: 16 },
  menuItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuText: { fontSize: 16, color: colors.text },
  signOut: { borderBottomWidth: 0, marginTop: 16 },
})
