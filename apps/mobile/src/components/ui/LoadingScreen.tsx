import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { useTheme } from '../../context/ThemeContext'

export function LoadingScreen() {
  const { colors } = useTheme()
  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
})
