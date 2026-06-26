import { useState } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TextInput,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, Stack } from 'expo-router'
import { useTheme } from '../src/context/ThemeContext'
import { useLanguage } from '../src/context/LanguageContext'
import { useAuth } from '../src/context/AuthContext'
import { useLibrarian } from '../src/hooks/useLibrarian'
import { isValidLibrarianQuery, MAX_QUERY_LENGTH } from '../src/lib/agents'
import { fonts } from '../src/theme/typography'
import { EmptyState } from '../src/components/ui/EmptyState'
import { PressableScale } from '../src/components/ui/PressableScale'
import { LibrarianResults } from '../src/components/librarian/LibrarianResults'

// Ask the librarian (Librarian agent, AI-Agent-3). NL request → reasoning + ranked recommendation cards.
// Signed-in only (it's a `/me/` endpoint). `library` cards navigate to the in-app book; `open_library` cards
// are marked external suggestions with no navigation.
export default function LibrarianScreen() {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const { user } = useAuth()
  const router = useRouter()
  const librarian = useLibrarian()
  const [query, setQuery] = useState('')

  const canAsk = isValidLibrarianQuery(query) && librarian.phase !== 'asking'
  const handleAsk = () => {
    if (canAsk) librarian.run(query.trim())
  }
  const handleOpen = (slug: string) => router.push(`/book/${slug}`)

  const screen = <Stack.Screen options={{ title: t('librarian.title'), headerShown: true }} />

  // Signed-out
  if (!user) {
    return (
      <>
        {screen}
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <EmptyState
            icon="library-outline"
            title={t('librarian.signIn.title')}
            subtitle={t('librarian.signIn.subtitle')}
            buttonLabel={t('librarian.signIn.cta')}
            onButtonPress={() => router.replace('/(auth)/login')}
          />
        </SafeAreaView>
      </>
    )
  }

  return (
    <>
      {screen}
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Prompt */}
          <View style={styles.promptBox}>
            <Text style={[styles.subtitle, { color: colors.textSecondary, fontFamily: fonts.sans }]}>
              {t('librarian.subtitle')}
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, fontFamily: fonts.sans }]}
              value={query}
              onChangeText={setQuery}
              placeholder={t('librarian.placeholder')}
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={MAX_QUERY_LENGTH}
              accessibilityLabel={t('librarian.inputLabel')}
              returnKeyType="search"
              blurOnSubmit
              onSubmitEditing={handleAsk}
            />
            <PressableScale
              onPress={handleAsk}
              disabled={!canAsk}
              style={[styles.askBtn, { backgroundColor: canAsk ? colors.primary : colors.border }]}
              accessibilityRole="button"
              accessibilityLabel={t('librarian.ask')}
            >
              {librarian.phase === 'asking' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="sparkles-outline" size={16} color="#fff" />
                  <Text style={[styles.askBtnText, { fontFamily: fonts.sansBold }]}>{t('librarian.ask')}</Text>
                </>
              )}
            </PressableScale>
          </View>

          <ScrollView contentContainerStyle={styles.results} keyboardShouldPersistTaps="handled">
            {librarian.phase === 'asking' && (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.thinking, { color: colors.textSecondary, fontFamily: fonts.sans }]}>
                  {t('librarian.thinking')}
                </Text>
              </View>
            )}

            {librarian.phase === 'empty' && (
              <EmptyState
                icon="search-outline"
                title={t('librarian.empty.title')}
                subtitle={t('librarian.empty.subtitle')}
              />
            )}

            {librarian.phase === 'error' && (
              <EmptyState
                icon="warning-outline"
                title={t('librarian.error.title')}
                subtitle={librarian.error || t('librarian.error.subtitle')}
                buttonLabel={t('librarian.error.retry')}
                onButtonPress={() => librarian.retry()}
              />
            )}

            {librarian.phase === 'results' && librarian.response && (
              <LibrarianResults response={librarian.response} t={t} onOpen={handleOpen} />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  )
}

const styles = StyleSheet.create({
  promptBox: { padding: 16, gap: 10 },
  subtitle: { fontSize: 13, lineHeight: 19 },
  input: {
    minHeight: 90,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  askBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  askBtnText: { color: '#fff', fontSize: 16 },
  results: { padding: 16, paddingTop: 0, paddingBottom: 32 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 16 },
  thinking: { fontSize: 14, textAlign: 'center' },
})
