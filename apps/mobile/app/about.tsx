import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native'
import { Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
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

        {/* Creator card */}
        <View style={[styles.creatorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.creatorAvatar, { backgroundColor: colors.primary }]}>
            <Text style={{ fontFamily: fonts.serifBold, fontSize: 28, color: '#fff' }}>V</Text>
          </View>
          <Text style={[styles.creatorName, { color: colors.text }]}>Vasyl Vdovychenko</Text>
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>vasyl.vdov@gmail.com</Text>

          <View style={{ gap: 8, width: '100%' }}>
            <TouchableOpacity
              style={[styles.creatorBtn, { backgroundColor: colors.primary }]}
              onPress={() => Linking.openURL('mailto:vasyl.vdov@gmail.com')}
            >
              <Ionicons name="mail-outline" size={18} color="#fff" />
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: '#fff' }}>Email</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.creatorBtn, { borderWidth: 1, borderColor: colors.border }]}
              onPress={() => Linking.openURL('https://www.linkedin.com/in/vasyl-vdovychenko/')}
            >
              <Ionicons name="logo-linkedin" size={18} color={colors.text} />
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors.text }}>LinkedIn</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.creatorBtn, { borderWidth: 1, borderColor: colors.border }]}
              onPress={() => Linking.openURL('https://vasyl.blog/')}
            >
              <Ionicons name="globe-outline" size={18} color={colors.text} />
              <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: colors.text }}>Blog</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontFamily: fonts.serifBold, fontSize: 28, marginBottom: 16 },
  sectionTitle: { fontFamily: fonts.serifBold, fontSize: 20, marginTop: 24, marginBottom: 8 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 24, marginBottom: 12 },
  creatorCard: { marginTop: 24, padding: 20, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  creatorAvatar: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  creatorName: { fontFamily: fonts.serifBold, fontSize: 18, marginBottom: 4 },
  creatorBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: 8 },
})
