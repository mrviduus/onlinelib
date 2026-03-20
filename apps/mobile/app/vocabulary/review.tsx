import { useEffect, useState, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, SafeAreaView, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, Stack } from 'expo-router'
import { vocabularyApi } from '@textstack/shared'
import type { ReviewCardDto } from '@textstack/shared'
import { useTheme } from '../../src/context/ThemeContext'
import { fonts } from '../../src/theme/typography'

type SessionState = 'loading' | 'card' | 'feedback' | 'summary'

interface SessionStats {
  reviewed: number
  correct: number
}

export default function VocabularyReviewScreen() {
  const { colors } = useTheme()
  const router = useRouter()
  const [state, setState] = useState<SessionState>('loading')
  const [cards, setCards] = useState<ReviewCardDto[]>([])
  const [index, setIndex] = useState(0)
  const [lastCorrect, setLastCorrect] = useState(false)
  const [stats, setStats] = useState<SessionStats>({ reviewed: 0, correct: 0 })
  const startTimeRef = useRef(0)

  useEffect(() => {
    vocabularyApi.getReviewQueue(20)
      .then(queue => {
        setCards(queue)
        setState(queue.length > 0 ? 'card' : 'summary')
        startTimeRef.current = Date.now()
      })
      .catch(e => {
        console.error('Review queue error:', e)
        setState('summary')
      })
  }, [])

  const currentCard = cards[index]

  const submitAnswer = async (isCorrect: boolean) => {
    const responseTimeMs = Date.now() - startTimeRef.current
    setLastCorrect(isCorrect)
    setStats(prev => ({
      reviewed: prev.reviewed + 1,
      correct: prev.correct + (isCorrect ? 1 : 0),
    }))
    setState('feedback')

    vocabularyApi.submitReview({
      wordId: currentCard.wordId,
      isCorrect,
      responseTimeMs,
      reviewMode: currentCard.reviewMode,
    }).catch(() => {})
  }

  const nextCard = () => {
    if (index + 1 < cards.length) {
      setIndex(index + 1)
      setState('card')
      startTimeRef.current = Date.now()
    } else {
      setState('summary')
    }
  }

  if (state === 'loading') {
    return (
      <>
        <Stack.Screen options={{ title: 'Review', headerShown: true }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </>
    )
  }

  if (state === 'summary') {
    const rate = stats.reviewed > 0 ? Math.round((stats.correct / stats.reviewed) * 100) : 0
    return (
      <>
        <Stack.Screen options={{ title: 'Review Complete', headerShown: true }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Ionicons name="ribbon-outline" size={56} color={colors.primary} style={{ marginBottom: 16 }} />
          <Text style={[styles.summaryTitle, { color: colors.text, fontFamily: fonts.serifBold }]}>Session Complete!</Text>
          <View style={styles.summaryStats}>
            <Text style={[styles.summaryStatText, { color: colors.textSecondary, fontFamily: fonts.sans }]}>Reviewed: {stats.reviewed}</Text>
            <Text style={[styles.summaryStatText, { color: colors.textSecondary, fontFamily: fonts.sans }]}>Correct: {rate}%</Text>
          </View>
          <TouchableOpacity style={[styles.doneBtn, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
            <Text style={[styles.doneBtnText, { fontFamily: fonts.sansMedium }]}>Back to Vocabulary</Text>
          </TouchableOpacity>
        </View>
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: `Review (${index + 1}/${cards.length})`, headerShown: true }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Progress bar */}
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${((index) / cards.length) * 100}%`, backgroundColor: colors.primary }]} />
          </View>

          {state === 'card' && currentCard && (
            <CardRenderer card={currentCard} onSubmit={submitAnswer} />
          )}

          {state === 'feedback' && currentCard && (
            <FeedbackView
              card={currentCard}
              isCorrect={lastCorrect}
              onNext={nextCard}
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  )
}

// --- Card Renderer ---

function CardRenderer({ card, onSubmit }: { card: ReviewCardDto; onSubmit: (correct: boolean) => void }) {
  if (card.reviewMode === 'multiple_choice') {
    return <MultipleChoiceCard card={card} onSubmit={onSubmit} />
  }
  if (card.reviewMode === 'typed_recall') {
    return <TypedRecallCard card={card} onSubmit={onSubmit} />
  }
  return <ContextCard card={card} onSubmit={onSubmit} />
}

// --- Multiple Choice ---

function MultipleChoiceCard({ card, onSubmit }: { card: ReviewCardDto; onSubmit: (correct: boolean) => void }) {
  const { colors } = useTheme()
  const prompt = card.definition || card.translation || card.word

  return (
    <View style={styles.cardContainer}>
      <Text style={[styles.cardLabel, { color: colors.textSecondary, fontFamily: fonts.sans }]}>What word matches this?</Text>
      <Text style={[styles.cardPrompt, { color: colors.text, fontFamily: fonts.serifBold }]}>{prompt}</Text>
      {card.hint && <Text style={[styles.cardHint, { color: colors.primary, fontFamily: fonts.sans }]}>Hint: {card.hint}</Text>}

      <View style={styles.optionsContainer}>
        {(card.options || []).map((opt, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.optionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => onSubmit(opt.toLowerCase() === card.word.toLowerCase())}
          >
            <Text style={[styles.optionText, { color: colors.text, fontFamily: fonts.sansMedium }]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

// --- Typed Recall ---

function TypedRecallCard({ card, onSubmit }: { card: ReviewCardDto; onSubmit: (correct: boolean) => void }) {
  const { colors } = useTheme()
  const [input, setInput] = useState('')
  const prompt = card.definition || card.translation || 'Type the word'

  const handleSubmit = () => {
    const correct = fuzzyMatch(input.trim(), card.word)
    onSubmit(correct)
  }

  return (
    <View style={styles.cardContainer}>
      <Text style={[styles.cardLabel, { color: colors.textSecondary, fontFamily: fonts.sans }]}>Type the word</Text>
      <Text style={[styles.cardPrompt, { color: colors.text, fontFamily: fonts.serifBold }]}>{prompt}</Text>
      {card.hint && <Text style={[styles.cardHint, { color: colors.primary, fontFamily: fonts.sans }]}>Hint: {card.hint}</Text>}

      <TextInput
        style={[styles.typedInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, fontFamily: fonts.sans }]}
        value={input}
        onChangeText={setInput}
        placeholder="Type your answer..."
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        onSubmitEditing={handleSubmit}
      />
      <TouchableOpacity
        style={[styles.submitBtn, { backgroundColor: colors.primary }, !input.trim() && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!input.trim()}
      >
        <Text style={[styles.submitBtnText, { fontFamily: fonts.sansMedium }]}>Check</Text>
      </TouchableOpacity>
    </View>
  )
}

// --- Context (fill-in-blank) ---

function ContextCard({ card, onSubmit }: { card: ReviewCardDto; onSubmit: (correct: boolean) => void }) {
  const { colors } = useTheme()
  const [input, setInput] = useState('')

  // Create blank sentence
  const blankSentence = card.sentence
    ? card.sentence.replace(new RegExp(card.word, 'gi'), '______')
    : `______ (${card.definition || card.translation || ''})`

  const handleSubmit = () => {
    const correct = fuzzyMatch(input.trim(), card.word)
    onSubmit(correct)
  }

  return (
    <View style={styles.cardContainer}>
      <Text style={[styles.cardLabel, { color: colors.textSecondary, fontFamily: fonts.sans }]}>Fill in the blank</Text>
      <Text style={[styles.cardPrompt, { color: colors.text, fontFamily: fonts.serifBold }]}>{blankSentence}</Text>
      {card.hint && <Text style={[styles.cardHint, { color: colors.primary, fontFamily: fonts.sans }]}>Hint: {card.hint}</Text>}

      <TextInput
        style={[styles.typedInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, fontFamily: fonts.sans }]}
        value={input}
        onChangeText={setInput}
        placeholder="Type the missing word..."
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        onSubmitEditing={handleSubmit}
      />
      <TouchableOpacity
        style={[styles.submitBtn, { backgroundColor: colors.primary }, !input.trim() && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!input.trim()}
      >
        <Text style={[styles.submitBtnText, { fontFamily: fonts.sansMedium }]}>Check</Text>
      </TouchableOpacity>
    </View>
  )
}

// --- Feedback ---

function FeedbackView({ card, isCorrect, onNext }: { card: ReviewCardDto; isCorrect: boolean; onNext: () => void }) {
  const { colors } = useTheme()
  return (
    <View style={styles.cardContainer}>
      <View style={[styles.feedbackBanner, isCorrect ? styles.feedbackCorrect : styles.feedbackWrong]}>
        <Ionicons
          name={isCorrect ? 'checkmark-circle' : 'close-circle'}
          size={28}
          color={isCorrect ? '#059669' : '#DC2626'}
        />
        <Text style={[styles.feedbackText, { color: isCorrect ? '#059669' : '#DC2626', fontFamily: fonts.sansBold }]}>
          {isCorrect ? 'Correct!' : 'Wrong'}
        </Text>
      </View>

      {!isCorrect && (
        <View style={styles.correctAnswer}>
          <Text style={[styles.correctLabel, { color: colors.textSecondary, fontFamily: fonts.sans }]}>Correct answer:</Text>
          <Text style={[styles.correctWord, { color: colors.text, fontFamily: fonts.serifBold }]}>{card.word}</Text>
          {card.translation && <Text style={[styles.correctTranslation, { color: colors.textSecondary, fontFamily: fonts.sans }]}>= {card.translation}</Text>}
        </View>
      )}

      {card.sentence && (
        <Text style={[styles.feedbackSentence, { color: colors.textSecondary, fontFamily: fonts.sans }]}>"{card.sentence}"</Text>
      )}

      <TouchableOpacity style={[styles.nextBtn, { backgroundColor: colors.primary }]} onPress={onNext}>
        <Text style={[styles.nextBtnText, { fontFamily: fonts.sansMedium }]}>Next</Text>
      </TouchableOpacity>
    </View>
  )
}

// --- Fuzzy match ---

function fuzzyMatch(input: string, expected: string): boolean {
  const a = input.toLowerCase()
  const b = expected.toLowerCase()
  if (a === b) return true
  const dist = levenshtein(a, b)
  return b.length <= 6 ? dist <= 1 : dist <= 2
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

// --- Styles ---

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },

  // Progress
  progressTrack: { height: 3 },
  progressFill: { height: '100%' },

  // Card
  cardContainer: { flex: 1, padding: 20, justifyContent: 'center' },
  cardLabel: { fontSize: 13, textAlign: 'center', marginBottom: 8 },
  cardPrompt: { fontSize: 20, textAlign: 'center', marginBottom: 12, lineHeight: 28 },
  cardHint: { fontSize: 13, textAlign: 'center', fontStyle: 'italic', marginBottom: 16 },

  // MC options
  optionsContainer: { marginTop: 24, gap: 10 },
  optionBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  optionText: { fontSize: 16 },

  // Typed input
  typedInput: {
    marginTop: 24,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  submitBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: '#fff', fontSize: 16 },

  // Feedback
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  feedbackCorrect: { backgroundColor: '#D1FAE5' },
  feedbackWrong: { backgroundColor: '#FEE2E2' },
  feedbackText: { fontSize: 18 },
  correctAnswer: { alignItems: 'center', marginBottom: 16 },
  correctLabel: { fontSize: 13 },
  correctWord: { fontSize: 22, marginTop: 4 },
  correctTranslation: { fontSize: 15, marginTop: 2 },
  feedbackSentence: { fontSize: 14, textAlign: 'center', fontStyle: 'italic', marginBottom: 16 },
  nextBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  nextBtnText: { color: '#fff', fontSize: 16 },

  // Summary
  summaryTitle: { fontSize: 24, marginBottom: 16 },
  summaryStats: { gap: 8, alignItems: 'center', marginBottom: 24 },
  summaryStatText: { fontSize: 18 },
  doneBtn: {
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 8,
  },
  doneBtnText: { color: '#fff', fontSize: 16 },
})
