import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../context/ThemeContext'
import { fonts } from '../../theme/typography'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

interface EmptyStateProps {
  icon: IoniconsName
  title: string
  subtitle?: string
  buttonLabel?: string
  onButtonPress?: () => void
}

export function EmptyState({ icon, title, subtitle, buttonLabel, onButtonPress }: EmptyStateProps) {
  const { colors } = useTheme()
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={48} color={colors.textSecondary} style={{ marginBottom: 12 }} />
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
      ) : null}
      {buttonLabel && onButtonPress ? (
        <TouchableOpacity
          style={[styles.button, { borderColor: colors.primary }]}
          onPress={onButtonPress}
        >
          <Text style={[styles.buttonText, { color: colors.primary }]}>{buttonLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontFamily: fonts.sansMedium, fontSize: 16, textAlign: 'center' },
  subtitle: { fontFamily: fonts.sans, fontSize: 13, textAlign: 'center', marginTop: 4 },
  button: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
  },
  buttonText: { fontFamily: fonts.sansMedium, fontSize: 14 },
})
