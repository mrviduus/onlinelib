import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native'
import { Stack } from 'expo-router'
import { PRIVACY_SECTIONS } from '@textstack/shared'
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

        {/* Section order lives in @textstack/shared so this screen and the web page
            cannot drift apart — Play requires the in-app policy and the policy at the
            listed URL to say the same thing. */}
        {PRIVACY_SECTIONS.map(section => (
          <View key={section.heading}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t(section.heading)}</Text>
            {section.bodies.map(body => (
              <Text key={body} style={[styles.body, { color: colors.text }]}>{t(body)}</Text>
            ))}
            {section.link ? (
              <TouchableOpacity onPress={() => Linking.openURL(section.link!.url)}>
                <Text style={[styles.body, { color: colors.primary }]}>{t(section.link.label)}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}

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
