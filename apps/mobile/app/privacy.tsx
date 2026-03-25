import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native'
import { Stack } from 'expo-router'
import { useTheme } from '../src/context/ThemeContext'
import { useLanguage } from '../src/context/LanguageContext'
import { fonts } from '../src/theme/typography'

export default function PrivacyScreen() {
  const { colors } = useTheme()
  const { t } = useLanguage()

  return (
    <>
      <Stack.Screen options={{
        title: t('privacy.title'),
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.sansMedium, fontSize: 16 },
        headerShadowVisible: false,
      }} />
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>{t('privacy.title')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('privacy.intro')}</Text>
        <Text style={[styles.updated, { color: colors.textSecondary }]}>{t('privacy.updated')}</Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('privacy.collectHeading')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('privacy.collectBody1')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('privacy.collectBody2')}</Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('privacy.cookiesHeading')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('privacy.cookiesBody1')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('privacy.cookiesBody2')}</Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('privacy.thirdPartiesHeading')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('privacy.thirdPartiesBody')}</Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('privacy.storageHeading')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('privacy.storageBody1')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('privacy.storageBody2')}</Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('privacy.rightsHeading')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('privacy.rightsBody')}</Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('privacy.contactHeading')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Text style={[styles.body, { color: colors.text }]}>{t('privacy.contactBody')} </Text>
          <TouchableOpacity onPress={() => Linking.openURL('mailto:vasyl.vdov@gmail.com')}>
            <Text style={[styles.body, { color: colors.primary }]}>vasyl.vdov@gmail.com</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontFamily: fonts.serifBold, fontSize: 28, marginBottom: 16 },
  updated: { fontFamily: fonts.sans, fontSize: 13, marginBottom: 16 },
  sectionTitle: { fontFamily: fonts.serifBold, fontSize: 20, marginTop: 24, marginBottom: 8 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 24, marginBottom: 12 },
})
