import { View, Text, StyleSheet } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { colors } from '../../src/theme/colors'

export default function GenreScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  return (
    <>
      <Stack.Screen options={{ title: 'Genre', headerShown: true }} />
      <View style={styles.center}>
        <Text style={styles.text}>Genre: {slug}</Text>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  text: { fontSize: 16, color: colors.textSecondary },
})
