import { ScrollView, Text, StyleSheet } from 'react-native'
import { Stack } from 'expo-router'
import { useTheme } from '../src/context/ThemeContext'
import { useLanguage } from '../src/context/LanguageContext'
import { fonts } from '../src/theme/typography'

export default function AboutScreen() {
  const { colors } = useTheme()
  const { t } = useLanguage()

  return (
    <>
      <Stack.Screen options={{
        title: t('about.title'),
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.sansMedium, fontSize: 16 },
        headerShadowVisible: false,
      }} />
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>{t('about.title')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('about.intro')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('about.mission')}</Text>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('about.whyTitle')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('about.whyText')}</Text>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('about.techTitle')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('about.techText')}</Text>
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontFamily: fonts.serifBold, fontSize: 28, marginBottom: 16 },
  sectionTitle: { fontFamily: fonts.serifBold, fontSize: 20, marginTop: 24, marginBottom: 8 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 24, marginBottom: 12 },
})
