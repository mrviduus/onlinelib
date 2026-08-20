import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native'
import { Stack } from 'expo-router'
import { useTheme } from '../src/context/ThemeContext'
import { useLanguage } from '../src/context/LanguageContext'
import { fonts } from '../src/theme/typography'

export default function TermsScreen() {
  const { colors } = useTheme()
  const { t } = useLanguage()

  return (
    <>
      <Stack.Screen options={{
        title: t('terms.title'),
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.sansMedium, fontSize: 16 },
        headerShadowVisible: false,
      }} />
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>{t('terms.title')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('terms.intro')}</Text>
        <Text style={[styles.updated, { color: colors.textSecondary }]}>{t('terms.updated')}</Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('terms.acceptanceHeading')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('terms.acceptanceBody')}</Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('terms.contentHeading')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('terms.contentBody1')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('terms.contentBody2')}</Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('terms.useHeading')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('terms.useIntro')}</Text>
        {[1, 2, 3, 4].map(i => (
          <View key={i} style={styles.bulletRow}>
            <Text style={[styles.bullet, { color: colors.primary }]}>{'\u2022'}</Text>
            <Text style={[styles.bulletText, { color: colors.text }]}>{t(`terms.use${i}`)}</Text>
          </View>
        ))}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('terms.ipHeading')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('terms.ipBody1')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('terms.ipBody2')}</Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('terms.uploadsHeading')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('terms.uploadsWarranty')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('terms.uploadsIndemnify')}</Text>
        {/* The DMCA process is a web page; users upload their own books from the app,
            so the app has to be able to point rights holders at it. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Text style={[styles.body, { color: colors.text }]}>{t('terms.uploadsDmcaBefore')}</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://textstack.app/dmca')}>
            <Text style={[styles.body, { color: colors.primary }]}>{t('terms.uploadsDmcaLink')}</Text>
          </TouchableOpacity>
          <Text style={[styles.body, { color: colors.text }]}>{t('terms.uploadsDmcaAfter')}</Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('terms.aiHeading')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('terms.aiBody1')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('terms.aiBody2')}</Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('terms.disclaimerHeading')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('terms.disclaimerBody1')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('terms.disclaimerBody2')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('terms.liabilityCap')}</Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('terms.changesHeading')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('terms.changesBody')}</Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('terms.contactHeading')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Text style={[styles.body, { color: colors.text }]}>{t('terms.contactBody')} </Text>
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
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 6, paddingLeft: 4 },
  bullet: { fontFamily: fonts.sans, fontSize: 18, lineHeight: 24 },
  bulletText: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 24, flex: 1 },
})
