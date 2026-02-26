import { useEffect, useState, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, SafeAreaView, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useRouter, Stack } from 'expo-router'
import { vocabularyApi } from '@textstack/shared'
import type { ReviewCardDto } from '@textstack/shared'
import { colors } from '../../src/theme/colors'

type SessionState = 'loading' | 'card' | 'feedback' | 'summary'

interface SessionStats {
  reviewed: number
  correct: number
}

export default function VocabularyReviewScreen() {
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
        <View style={styles.center}>
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
        <View style={styles.center}>
          <Text style={styles.summaryEmoji}>🎉</Text>
          <Text style={styles.summaryTitle}>Session Complete!</Text>
          <View style={styles.summaryStats}>
            <Text style={styles.summaryStatText}>Reviewed: {stats.reviewed}</Text>
            <Text style={styles.summaryStatText}>Correct: {rate}%</Text>
          </View>
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>Back to Vocabulary</Text>
          </TouchableOpacity>
        </View>
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: `Review (${index + 1}/${cards.length})`, headerShown: true }} />
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${((index) / cards.length) * 100}%` }]} />
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
  const prompt = card.definition || card.translation || card.word

  return (
    <View style={styles.cardContainer}>
      <Text style={styles.cardLabel}>What word matches this?</Text>
      <Text style={styles.cardPrompt}>{prompt}</Text>
      {card.hint && <Text style={styles.cardHint}>Hint: {card.hint}</Text>}

      <View style={styles.optionsContainer}>
        {(card.options || []).map((opt, i) => (
          <TouchableOpacity
            key={i}
            style={styles.optionBtn}
            onPress={() => onSubmit(opt.toLowerCase() === card.word.toLowerCase())}
          >
            <Text style={styles.optionText}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

// --- Typed Recall ---

function TypedRecallCard({ card, onSubmit }: { card: ReviewCardDto; onSubmit: (correct: boolean) => void }) {
  const [input, setInput] = useState('')
  const prompt = card.definition || card.translation || 'Type the word'

  const handleSubmit = () => {
    const correct = fuzzyMatch(input.trim(), card.word)
    onSubmit(correct)
  }

  return (
    <View style={styles.cardContainer}>
      <Text style={styles.cardLabel}>Type the word</Text>
      <Text style={styles.cardPrompt}>{prompt}</Text>
      {card.hint && <Text style={styles.cardHint}>Hint: {card.hint}</Text>}

      <TextInput
        style={styles.typedInput}
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
        style={[styles.submitBtn, !input.trim() && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!input.trim()}
      >
        <Text style={styles.submitBtnText}>Check</Text>
      </TouchableOpacity>
    </View>
  )
}

// --- Context (fill-in-blank) ---

function ContextCard({ card, onSubmit }: { card: ReviewCardDto; onSubmit: (correct: boolean) => void }) {
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
      <Text style={styles.cardLabel}>Fill in the blank</Text>
      <Text style={styles.cardPrompt}>{blankSentence}</Text>
      {card.hint && <Text style={styles.cardHint}>Hint: {card.hint}</Text>}

      <TextInput
        style={styles.typedInput}
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
        style={[styles.submitBtn, !input.trim() && styles.submitBtnDisabled]}
        onPress={handleSubmit}
        disabled={!input.trim()}
      >
        <Text style={styles.submitBtnText}>Check</Text>
      </TouchableOpacity>
    </View>
  )
}

// --- Feedback ---

function FeedbackView({ card, isCorrect, onNext }: { card: ReviewCardDto; isCorrect: boolean; onNext: () => void }) {
  return (
    <View style={styles.cardContainer}>
      <View style={[styles.feedbackBanner, isCorrect ? styles.feedbackCorrect : styles.feedbackWrong]}>
        <Text style={styles.feedbackIcon}>{isCorrect ? '✓' : '✗'}</Text>
        <Text style={styles.feedbackText}>{isCorrect ? 'Correct!' : 'Wrong'}</Text>
      </View>

      {!isCorrect && (
        <View style={styles.correctAnswer}>
          <Text style={styles.correctLabel}>Correct answer:</Text>
          <Text style={styles.correctWord}>{card.word}</Text>
          {card.translation && <Text style={styles.correctTranslation}>= {card.translation}</Text>}
        </View>
      )}

      {card.sentence && (
        <Text style={styles.feedbackSentence}>"{card.sentence}"</Text>
      )}

      <TouchableOpacity style={styles.nextBtn} onPress={onNext}>
        <Text style={styles.nextBtnText}>Next</Text>
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
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 20 },

  // Progress
  progressTrack: { height: 3, backgroundColor: colors.border },
  progressFill: { height: '100%', backgroundColor: colors.primary },

  // Card
  cardContainer: { flex: 1, padding: 20, justifyContent: 'center' },
  cardLabel: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 8 },
  cardPrompt: { fontSize: 20, fontWeight: '600', color: colors.text, textAlign: 'center', marginBottom: 12, lineHeight: 28 },
  cardHint: { fontSize: 13, color: colors.primary, textAlign: 'center', fontStyle: 'italic', marginBottom: 16 },

  // MC options
  optionsContainer: { marginTop: 24, gap: 10 },
  optionBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  optionText: { fontSize: 16, fontWeight: '500', color: colors.text },

  // Typed input
  typedInput: {
    marginTop: 24,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  submitBtn: {
    marginTop: 12,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

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
  feedbackIcon: { fontSize: 24, fontWeight: '700' },
  feedbackText: { fontSize: 18, fontWeight: '600' },
  correctAnswer: { alignItems: 'center', marginBottom: 16 },
  correctLabel: { fontSize: 13, color: colors.textSecondary },
  correctWord: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 4 },
  correctTranslation: { fontSize: 15, color: colors.textSecondary, marginTop: 2 },
  feedbackSentence: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', fontStyle: 'italic', marginBottom: 16 },
  nextBtn: {
    marginTop: 20,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // Summary
  summaryEmoji: { fontSize: 48, marginBottom: 16 },
  summaryTitle: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 16 },
  summaryStats: { gap: 8, alignItems: 'center', marginBottom: 24 },
  summaryStatText: { fontSize: 18, color: colors.textSecondary },
  doneBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 8,
  },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})
