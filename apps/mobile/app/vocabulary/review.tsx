import { useEffect, useState, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, SafeAreaView, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, Stack, useLocalSearchParams } from 'expo-router'
import { vocabularyApi, dictionaryApi } from '@textstack/shared'
import type { ReviewCardDto, SubmitReviewResponse } from '@textstack/shared'
import { useTheme } from '../../src/context/ThemeContext'
import { useLanguage } from '../../src/context/LanguageContext'
import { fonts } from '../../src/theme/typography'
import { useTts } from '../../src/hooks/useTts'

type SessionState = 'loading' | 'card' | 'feedback' | 'summary'

interface SessionStats {
  reviewed: number
  correct: number
}

const STAGE_NAMES = ['New', 'Recognition', 'Recall', 'Context', 'Mastered']

export default function VocabularyReviewScreen() {
  const { colors } = useTheme()
  const { language } = useLanguage()
  const router = useRouter()
  const params = useLocalSearchParams<{ mode?: string; limit?: string }>()
  const mode = params.mode === 'practice' ? 'practice' : 'srs'
  const batchSize = (() => {
    const v = parseInt(params.limit || '20', 10)
    return [10, 20, 50].includes(v) ? v : 20
  })()
  const [state, setState] = useState<SessionState>('loading')
  const [cards, setCards] = useState<ReviewCardDto[]>([])
  const [index, setIndex] = useState(0)
  const [lastCorrect, setLastCorrect] = useState(false)
  const [lastResult, setLastResult] = useState<SubmitReviewResponse | null>(null)
  const [stats, setStats] = useState<SessionStats>({ reviewed: 0, correct: 0 })
  const [dueCount, setDueCount] = useState(0)
  const startTimeRef = useRef(0)
  const sessionStartRef = useRef(Date.now())
  const { toggle: toggleTts, isSpeaking } = useTts()

  const loadCards = () => {
    setState('loading')
    setIndex(0)
    setStats({ reviewed: 0, correct: 0 })
    sessionStartRef.current = Date.now()
    vocabularyApi.getReviewQueue(batchSize, mode)
      .then(res => {
        setCards(res.cards)
        setDueCount(res.totalDue)
        setState(res.cards.length > 0 ? 'card' : 'summary')
        startTimeRef.current = Date.now()
      })
      .catch(e => {
        console.error('Review queue error:', e)
        setState('summary')
      })
  }

  useEffect(() => { loadCards() }, [mode])

  const currentCard = cards[index]

  const submitAnswer = async (isCorrect: boolean) => {
    const responseTimeMs = Date.now() - startTimeRef.current
    setLastCorrect(isCorrect)
    setStats(prev => ({
      reviewed: prev.reviewed + 1,
      correct: prev.correct + (isCorrect ? 1 : 0),
    }))

    try {
      const result = await vocabularyApi.submitReview({
        wordId: currentCard.wordId,
        isCorrect,
        responseTimeMs,
        reviewMode: currentCard.reviewMode,
        mode: mode === 'practice' ? 'practice' : undefined,
      })
      setLastResult(result)
    } catch {
      setLastResult(null)
    }
    setState('feedback')
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
        <Stack.Screen options={{ title: mode === 'practice' ? 'Practice' : 'Review', headerShown: true }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </>
    )
  }

  if (state === 'summary') {
    const rate = stats.reviewed > 0 ? Math.round((stats.correct / stats.reviewed) * 100) : 0
    const isEmpty = stats.reviewed === 0
    const elapsedSec = Math.round((Date.now() - sessionStartRef.current) / 1000)
    const elapsedMin = Math.floor(elapsedSec / 60)
    const elapsedRemSec = elapsedSec % 60
    const elapsedText = elapsedMin > 0 ? `${elapsedMin}m ${elapsedRemSec}s` : `${elapsedSec}s`
    return (
      <>
        <Stack.Screen options={{ title: isEmpty ? (mode === 'practice' ? 'Practice' : 'Review') : 'Session Complete', headerShown: true }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          {isEmpty ? (
            <>
              <Ionicons name="checkmark-circle-outline" size={56} color={colors.success} style={{ marginBottom: 16 }} />
              <Text style={[styles.summaryTitle, { color: colors.text, fontFamily: fonts.serifBold }]}>
                {mode === 'practice' ? 'No words to practice' : 'All caught up!'}
              </Text>
              <Text style={{ fontSize: 14, color: colors.textSecondary, fontFamily: fonts.sans, textAlign: 'center', marginBottom: 24 }}>
                {mode === 'practice' ? 'Add more words while reading to practice them.' : 'No words due for review right now.'}
              </Text>
            </>
          ) : (
            <>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🎉</Text>
              <Text style={[styles.summaryTitle, { color: colors.text, fontFamily: fonts.serifBold }]}>Session Complete!</Text>
              {mode === 'practice' && (
                <Text style={{ fontSize: 12, color: colors.primary, fontFamily: fonts.sansMedium, marginBottom: 8 }}>Practice Mode</Text>
              )}
              <View style={styles.summaryStats}>
                <Text style={[styles.summaryStatText, { color: colors.textSecondary, fontFamily: fonts.sans }]}>Reviewed: {stats.reviewed}</Text>
                <Text style={[styles.summaryStatText, { color: colors.textSecondary, fontFamily: fonts.sans }]}>Correct: {rate}%</Text>
                <Text style={[styles.summaryStatText, { color: colors.textSecondary, fontFamily: fonts.sans }]}>Time: {elapsedText}</Text>
              </View>
            </>
          )}

          {/* Batch size selector */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
            {[10, 20, 50].map(n => (
              <TouchableOpacity
                key={n}
                style={{
                  paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12,
                  backgroundColor: batchSize === n ? colors.primaryLight : 'transparent',
                  borderWidth: 1, borderColor: batchSize === n ? colors.primary : colors.border,
                }}
                onPress={() => router.replace(`/vocabulary/review?mode=${mode}&limit=${n}`)}
              >
                <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: batchSize === n ? colors.primary : colors.textSecondary }}>
                  {n} words
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.summaryBtns}>
            <TouchableOpacity
              style={[styles.summaryBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
              onPress={loadCards}
            >
              <Ionicons name="refresh-outline" size={18} color={colors.primary} />
              <Text style={[styles.summaryBtnText, { color: colors.primary, fontFamily: fonts.sansMedium }]}>
                {mode === 'practice' ? 'Practice Again' : 'Review Again'}
              </Text>
            </TouchableOpacity>

            {mode === 'practice' && dueCount > 0 && (
              <TouchableOpacity
                style={[styles.summaryBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.replace('/vocabulary/review')}
              >
                <Ionicons name="school-outline" size={18} color="#fff" />
                <Text style={[styles.summaryBtnText, { color: '#fff', fontFamily: fonts.sansMedium }]}>Review Due ({dueCount})</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.summaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.back()}
            >
              <Text style={[styles.summaryBtnText, { color: '#fff', fontFamily: fonts.sansMedium }]}>Back to Vocabulary</Text>
            </TouchableOpacity>
          </View>
        </View>
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={{
        title: `${mode === 'practice' ? 'Practice' : 'Review'} (${index + 1}/${cards.length})`,
        headerShown: true,
      }} />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Progress bar */}
          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${((index) / cards.length) * 100}%`, backgroundColor: colors.primary }]} />
          </View>

          {mode === 'practice' && (
            <View style={[styles.modeBadge, { backgroundColor: colors.primaryLight }]}>
              <Text style={{ fontSize: 11, color: colors.primary, fontFamily: fonts.sansMedium }}>Practice Mode</Text>
            </View>
          )}

          {state === 'card' && currentCard && (
            <CardRenderer card={currentCard} onSubmit={submitAnswer} onSpeak={(t) => toggleTts(t)} />
          )}

          {state === 'feedback' && currentCard && (
            <FeedbackView
              card={currentCard}
              isCorrect={lastCorrect}
              result={lastResult}
              onNext={nextCard}
              onSpeak={(t) => toggleTts(t)}
              language={language}
            />
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  )
}

// --- Card Renderer ---

function CardRenderer({ card, onSubmit, onSpeak }: { card: ReviewCardDto; onSubmit: (correct: boolean) => void; onSpeak: (text: string) => void }) {
  if (card.reviewMode === 'multiple_choice') {
    return <MultipleChoiceCard card={card} onSubmit={onSubmit} onSpeak={onSpeak} />
  }
  if (card.reviewMode === 'typed_recall') {
    return <TypedRecallCard card={card} onSubmit={onSubmit} onSpeak={onSpeak} />
  }
  return <ContextCard card={card} onSubmit={onSubmit} onSpeak={onSpeak} />
}

// --- Speak Button ---

function SpeakBtn({ text, onSpeak }: { text: string; onSpeak: (t: string) => void }) {
  const { colors } = useTheme()
  return (
    <TouchableOpacity onPress={() => onSpeak(text)} style={styles.speakBtn} hitSlop={8}>
      <Ionicons name="volume-medium-outline" size={18} color={colors.primary} />
    </TouchableOpacity>
  )
}

// --- Multiple Choice ---

function MultipleChoiceCard({ card, onSubmit, onSpeak }: { card: ReviewCardDto; onSubmit: (correct: boolean) => void; onSpeak: (text: string) => void }) {
  const { colors } = useTheme()
  const [selected, setSelected] = useState<number | null>(null)
  const prompt = card.blankSentence || card.definition || card.translation || card.word

  const handleSelect = (i: number) => {
    if (selected !== null) return
    setSelected(i)
    const opt = (card.options || [])[i]
    const isCorrect = opt?.toLowerCase() === card.word.toLowerCase()
    setTimeout(() => onSubmit(isCorrect), 400)
  }

  return (
    <View style={styles.cardContainer}>
      <Text style={[styles.cardLabel, { color: colors.textSecondary, fontFamily: fonts.sans }]}>What word matches this?</Text>
      <View style={styles.promptRow}>
        <Text style={[styles.cardPrompt, { color: colors.text, fontFamily: fonts.serifBold }]}>{prompt}</Text>
        <SpeakBtn text={card.blankSentence || card.word} onSpeak={onSpeak} />
      </View>
      {card.bookTitle && <Text style={[styles.cardSource, { color: colors.textSecondary, fontFamily: fonts.sans }]}>From: {card.bookTitle}</Text>}
      {card.hint && <Text style={[styles.cardHint, { color: colors.primary, fontFamily: fonts.sans }]}>Hint: {card.hint}</Text>}

      <View style={styles.optionsContainer}>
        {(card.options || []).map((opt, i) => {
          const isCorrectOption = opt.toLowerCase() === card.word.toLowerCase()
          const isSelected = selected === i
          let optStyle = { backgroundColor: colors.surface, borderColor: colors.border }
          if (selected !== null) {
            if (isCorrectOption) optStyle = { backgroundColor: '#D1FAE5', borderColor: '#059669' }
            else if (isSelected) optStyle = { backgroundColor: '#FEE2E2', borderColor: '#DC2626' }
          }
          return (
            <TouchableOpacity
              key={i}
              style={[styles.optionBtn, optStyle]}
              onPress={() => handleSelect(i)}
              disabled={selected !== null}
            >
              <Text style={[styles.optionText, { color: colors.text, fontFamily: fonts.sansMedium }]}>{opt}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

// --- Typed Recall ---

function TypedRecallCard({ card, onSubmit, onSpeak }: { card: ReviewCardDto; onSubmit: (correct: boolean) => void; onSpeak: (text: string) => void }) {
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
      <View style={styles.promptRow}>
        <Text style={[styles.cardPrompt, { color: colors.text, fontFamily: fonts.serifBold }]}>{prompt}</Text>
        <SpeakBtn text={card.definition || card.translation || card.word} onSpeak={onSpeak} />
      </View>
      {card.bookTitle && <Text style={[styles.cardSource, { color: colors.textSecondary, fontFamily: fonts.sans }]}>From: {card.bookTitle}</Text>}
      {card.hint && <Text style={[styles.cardHint, { color: colors.primary, fontFamily: fonts.sans }]}>Hint: {card.hint}</Text>}
      {card.originalSentence && (
        <Text style={[styles.cardSentence, { color: colors.textSecondary, fontFamily: fonts.sans }]}>"{card.originalSentence}"</Text>
      )}

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

function ContextCard({ card, onSubmit, onSpeak }: { card: ReviewCardDto; onSubmit: (correct: boolean) => void; onSpeak: (text: string) => void }) {
  const { colors } = useTheme()
  const [input, setInput] = useState('')

  const blankSentence = card.blankSentence
    || `______ (${card.definition || card.translation || ''})`

  const handleSubmit = () => {
    const correct = fuzzyMatch(input.trim(), card.word)
    onSubmit(correct)
  }

  return (
    <View style={styles.cardContainer}>
      <Text style={[styles.cardLabel, { color: colors.textSecondary, fontFamily: fonts.sans }]}>Fill in the blank</Text>
      <View style={styles.promptRow}>
        <Text style={[styles.cardPrompt, { color: colors.text, fontFamily: fonts.serifBold }]}>{blankSentence}</Text>
        <SpeakBtn text={card.originalSentence || card.word} onSpeak={onSpeak} />
      </View>
      {card.bookTitle && <Text style={[styles.cardSource, { color: colors.textSecondary, fontFamily: fonts.sans }]}>From: {card.bookTitle}</Text>}
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

function FeedbackView({ card, isCorrect, result, onNext, onSpeak, language }: {
  card: ReviewCardDto
  isCorrect: boolean
  result: SubmitReviewResponse | null
  onNext: () => void
  onSpeak: (text: string) => void
  language: string
}) {
  const { colors } = useTheme()
  const [fetchedDef, setFetchedDef] = useState<string | null>(null)

  // Lookup definition if missing
  useEffect(() => {
    if (card.definition) return
    dictionaryApi.lookupWord(language, card.word)
      .then(entry => {
        if (entry.meanings?.length) {
          const parts = entry.meanings.slice(0, 3).map(m => {
            const defs = m.definitions?.slice(0, 2).map((d, i) => `${i + 1}. ${d.definition}`).join(' ')
            return `${m.partOfSpeech}: ${defs}`
          })
          setFetchedDef(parts.join('\n'))
        }
      })
      .catch(() => {})
  }, [card.word, card.definition])

  const definition = card.definition || fetchedDef

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
        <SpeakBtn text={card.word} onSpeak={onSpeak} />
      </View>

      {!isCorrect && (
        <View style={styles.correctAnswer}>
          <Text style={[styles.correctLabel, { color: colors.textSecondary, fontFamily: fonts.sans }]}>Correct answer:</Text>
          <Text style={[styles.correctWord, { color: colors.text, fontFamily: fonts.serifBold }]}>{card.word}</Text>
          {card.translation && <Text style={[styles.correctTranslation, { color: colors.textSecondary, fontFamily: fonts.sans }]}>= {card.translation}</Text>}
        </View>
      )}

      {definition && (
        <Text style={[styles.feedbackDef, { color: colors.text, fontFamily: fonts.sans }]}>{definition}</Text>
      )}

      {card.originalSentence && (
        <Text style={[styles.feedbackSentence, { color: colors.textSecondary, fontFamily: fonts.sans }]}>
          "{card.originalSentence}"
          {card.bookTitle ? ` — ${card.bookTitle}` : ''}
        </Text>
      )}

      {!card.originalSentence && card.bookTitle && (
        <Text style={{ fontSize: 12, color: colors.textSecondary, fontFamily: fonts.sans, textAlign: 'center', marginBottom: 8 }}>
          — {card.bookTitle}
        </Text>
      )}

      {result?.stageChanged && (
        <View style={[styles.stageBadge, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="trending-up-outline" size={14} color={colors.primary} />
          <Text style={{ fontSize: 13, color: colors.primary, fontFamily: fonts.sansMedium }}>
            {STAGE_NAMES[result.previousStage] || `Stage ${result.previousStage}`} → {STAGE_NAMES[result.newStage] || `Stage ${result.newStage}`}
          </Text>
        </View>
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
  modeBadge: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: 8 },

  // Card
  cardContainer: { flex: 1, padding: 20, justifyContent: 'center' },
  cardLabel: { fontSize: 13, textAlign: 'center', marginBottom: 8 },
  promptRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 },
  cardPrompt: { fontSize: 20, textAlign: 'center', lineHeight: 28, flexShrink: 1 },
  cardSource: { fontSize: 12, textAlign: 'center', marginBottom: 8 },
  cardHint: { fontSize: 13, textAlign: 'center', fontStyle: 'italic', marginBottom: 16 },
  cardSentence: { fontSize: 14, textAlign: 'center', fontStyle: 'italic', marginBottom: 12 },
  speakBtn: { padding: 4 },

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
  feedbackDef: { fontSize: 14, textAlign: 'center', marginBottom: 12 },
  correctAnswer: { alignItems: 'center', marginBottom: 16 },
  correctLabel: { fontSize: 13 },
  correctWord: { fontSize: 22, marginTop: 4 },
  correctTranslation: { fontSize: 15, marginTop: 2 },
  feedbackSentence: { fontSize: 14, textAlign: 'center', fontStyle: 'italic', marginBottom: 8 },
  stageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: 12,
  },
  nextBtn: {
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  nextBtnText: { color: '#fff', fontSize: 16 },

  // Summary
  summaryTitle: { fontSize: 24, marginBottom: 16, textAlign: 'center' },
  summaryStats: { gap: 8, alignItems: 'center', marginBottom: 24 },
  summaryStatText: { fontSize: 18 },
  summaryBtns: { width: '100%', gap: 10 },
  summaryBtn: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  summaryBtnText: { fontSize: 16 },
})
