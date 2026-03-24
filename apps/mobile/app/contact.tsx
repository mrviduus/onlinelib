import { useState } from 'react'
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Linking } from 'react-native'
import { Stack } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../src/context/ThemeContext'
import { useLanguage } from '../src/context/LanguageContext'
import { fonts } from '../src/theme/typography'

export default function ContactScreen() {
  const { colors } = useTheme()
  const { t } = useLanguage()

  return (
    <>
      <Stack.Screen options={{
        title: t('contact.title'),
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.sansMedium, fontSize: 16 },
        headerShadowVisible: false,
      }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>{t('contact.title')}</Text>
        <Text style={[styles.body, { color: colors.text }]}>{t('contact.intro')}</Text>

        <TouchableOpacity
          style={[styles.contactCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => Linking.openURL('mailto:support@textstack.app')}
          activeOpacity={0.7}
        >
          <Ionicons name="mail-outline" size={24} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.contactLabel, { color: colors.text }]}>Email</Text>
            <Text style={[styles.contactValue, { color: colors.primary }]}>support@textstack.app</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontFamily: fonts.serifBold, fontSize: 28, marginBottom: 16 },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 24, marginBottom: 24 },
  contactCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 12, borderWidth: 1 },
  contactLabel: { fontFamily: fonts.sansMedium, fontSize: 14 },
  contactValue: { fontFamily: fonts.sans, fontSize: 14, marginTop: 2 },
})
