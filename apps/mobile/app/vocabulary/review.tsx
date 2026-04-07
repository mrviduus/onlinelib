import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, Stack, useLocalSearchParams } from 'expo-router'
import { REVIEW_BATCH_SIZES, DEFAULT_BATCH_SIZE } from '@textstack/shared'
import type { SelfAssessment, ReviewMode } from '@textstack/shared'
import { useTheme } from '../../src/context/ThemeContext'
import { useLanguage } from '../../src/context/LanguageContext'
import { useTts } from '../../src/hooks/useTts'
import { useHaptics } from '../../src/hooks/useHaptics'
import { useVocabularyReview } from '../../src/hooks/useVocabularyReview'
import { LoadingScreen } from '../../src/components/ui/LoadingScreen'
import { PressableScale } from '../../src/components/ui/PressableScale'
import { MultipleChoiceCard } from '../../src/components/vocabulary/MultipleChoiceCard'
import { FlashCard } from '../../src/components/vocabulary/FlashCard'
import { NewWordCard } from '../../src/components/vocabulary/NewWordCard'
import { ReviewFeedback } from '../../src/components/vocabulary/ReviewFeedback'
import { SessionSummary } from '../../src/components/vocabulary/SessionSummary'

export default function VocabularyReviewScreen() {
  const { colors } = useTheme()
  const { language } = useLanguage()
  const router = useRouter()
  const params = useLocalSearchParams<{ limit?: string; reviewMode?: string }>()

  const [batchSize, setBatchSize] = useState(() => {
    const v = parseInt(params.limit || String(DEFAULT_BATCH_SIZE), 10)
    return (REVIEW_BATCH_SIZES as readonly number[]).includes(v) ? v : DEFAULT_BATCH_SIZE
  })

  const review = useVocabularyReview()
  const { toggle: toggleTts } = useTts()
  const haptics = useHaptics()
  const sessionStartRef = useRef(Date.now())

  // Init review mode from params
  useEffect(() => {
    if (params.reviewMode === 'classic' || params.reviewMode === 'blitz') {
      review.setReviewMode(params.reviewMode)
    }
  }, [])

  // Start session
  useEffect(() => {
    sessionStartRef.current = Date.now()
    review.startSession(batchSize, review.reviewMode)
  }, [batchSize])

  const handleAnswer = async (isCorrect: boolean, responseTimeMs: number, selfAssessment?: SelfAssessment) => {
    haptics.play(isCorrect ? 'correct' : 'wrong')
    await review.submitAnswer(isCorrect, responseTimeMs, selfAssessment)
  }

  const handleFlip = () => haptics.play('flip')

  const handleAgain = () => {
    sessionStartRef.current = Date.now()
    review.startSession(batchSize, review.reviewMode)
  }

  // Loading
  if (review.loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Practice', headerShown: true }} />
        <LoadingScreen />
      </>
    )
  }

  // Session complete
  if (review.isSessionComplete || !review.hasCards) {
    haptics.play('complete')
    return (
      <>
        <Stack.Screen options={{ title: review.hasCards ? 'Session Complete' : 'Practice', headerShown: true }} />
        <SessionSummary
          reviewed={review.sessionStats.reviewed}
          correct={review.sessionStats.correct}
          elapsedMs={Date.now() - sessionStartRef.current}
          reviewMode={review.reviewMode}
          dueCount={review.totalDue}
          batchSize={batchSize}
          onAgain={handleAgain}
          onBack={() => router.back()}
          onBatchChange={setBatchSize}
          onModeChange={(m: ReviewMode) => review.setReviewMode(m)}
        />
      </>
    )
  }

  const card = review.currentCard!
  const progress = review.cards.length > 0 ? (review.currentIndex / review.cards.length) * 100 : 0

  return (
    <>
      <Stack.Screen options={{
        title: `Practice (${review.currentIndex + 1}/${review.cards.length})`,
        headerShown: true,
        headerRight: () => (
          <View style={styles.headerRight}>
            <PressableScale onPress={haptics.toggle} style={styles.headerBtn}>
              <Ionicons
                name={haptics.isEnabled() ? 'hand-left' : 'hand-left-outline'}
                size={20}
                color={haptics.isEnabled() ? colors.primary : colors.textSecondary}
              />
            </PressableScale>
          </View>
        ),
      }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Progress */}
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: colors.primary }]} />
          </View>

          {/* Mode badge */}
          <View style={styles.badgeRow}>
            <View style={[styles.modeBadge, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
              <Ionicons name={review.reviewMode === 'blitz' ? 'flash' : 'layers'} size={12} color={colors.textSecondary} />
              <Text style={[styles.modeBadgeText, { color: colors.textSecondary }]}>
                {review.reviewMode === 'blitz' ? 'Blitz' : 'Flashcards'}
              </Text>
            </View>
          </View>

          {/* Card area */}
          <View style={styles.cardArea}>
            {review.showingNewWord ? (
              <NewWordCard
                card={card}
                onContinue={review.dismissNewWord}
                onSpeak={(t) => toggleTts(t)}
              />
            ) : review.answerRevealed && review.lastResult ? (
              <ReviewFeedback
                card={card}
                result={review.lastResult}
                isCorrect={review.lastAnswerCorrect}
                reviewMode={review.reviewMode}
                onSpeak={(t) => toggleTts(t)}
                onNext={review.nextCard}
                language={language}
              />
            ) : review.reviewMode === 'classic' ? (
              <FlashCard
                card={card}
                onAnswer={(isCorrect, responseTimeMs, selfAssessment) =>
                  handleAnswer(isCorrect, responseTimeMs, selfAssessment)
                }
                onSpeak={(t) => toggleTts(t)}
                onFlip={handleFlip}
                disabled={review.submitting}
              />
            ) : (
              <MultipleChoiceCard
                card={card}
                onAnswer={(isCorrect, responseTimeMs) => handleAnswer(isCorrect, responseTimeMs)}
                onSpeak={(t) => toggleTts(t)}
                disabled={review.submitting}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  )
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', gap: 8 },
  headerBtn: { padding: 4 },
  progressTrack: { height: 3 },
  progressFill: { height: '100%' },
  badgeRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 },
  modeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  modeBadgeText: { fontSize: 11, fontFamily: 'Inter-Medium' },
  cardArea: { flex: 1, padding: 20, justifyContent: 'center' },
})
