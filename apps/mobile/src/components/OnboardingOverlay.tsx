import { useState, useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import { fonts } from '../theme/typography'

const STORAGE_KEY = 'onboarding_reader_done'
const { width: SCREEN_W } = Dimensions.get('window')

interface Props {
  onDismiss: () => void
}

export function OnboardingOverlay({ onDismiss }: Props) {
  const [step, setStep] = useState(0)
  const fadeAnim = useRef(new Animated.Value(0)).current
  const tapAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start()
  }, [])

  // Pulse animation for tap icon
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(tapAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(tapAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [])

  const tapScale = tapAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.1] })

  const next = () => {
    if (step < 2) {
      setStep(s => s + 1)
    } else {
      dismiss()
    }
  }

  const dismiss = async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'true')
    Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
      onDismiss()
    })
  }

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={next} />

      <View style={styles.content}>
        {step === 0 && (
          <>
            <Text style={styles.title}>Learn by reading</Text>
            <Text style={styles.subtitle}>Tap any word to see its translation</Text>
            <Animated.View style={[styles.tapIcon, { transform: [{ scale: tapScale }] }]}>
              <Ionicons name="hand-left-outline" size={48} color="#fff" />
            </Animated.View>
          </>
        )}

        {step === 1 && (
          <>
            <View style={styles.mockCard}>
              <Text style={styles.mockWord}>amorphous</Text>
              <Text style={styles.mockTranslation}>аморфний, безформний</Text>
              <View style={styles.mockSaveBtn}>
                <Ionicons name="add-circle" size={20} color="#fff" />
                <Text style={styles.mockSaveBtnText}>Save</Text>
              </View>
            </View>
            <Text style={styles.subtitle}>Save words to build your vocabulary</Text>
            <View style={styles.arrowContainer}>
              <Ionicons name="arrow-up" size={24} color="#fff" />
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Ionicons name="checkmark-circle" size={64} color="#10B981" />
            <Text style={styles.title}>You're ready!</Text>
            <Text style={styles.subtitle}>
              Saved words appear in your vocabulary{'\n'}for spaced repetition review
            </Text>
          </>
        )}

        <View style={styles.footer}>
          <View style={styles.dots}>
            {[0, 1, 2].map(i => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>
          <TouchableOpacity style={styles.btn} onPress={next}>
            <Text style={styles.btnText}>{step === 2 ? 'Got it' : 'Next'}</Text>
          </TouchableOpacity>
          {step < 2 && (
            <TouchableOpacity onPress={dismiss} style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Animated.View>
  )
}

export async function shouldShowOnboarding(): Promise<boolean> {
  const done = await AsyncStorage.getItem(STORAGE_KEY)
  return done !== 'true'
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
    zIndex: 1,
  },
  title: {
    fontFamily: fonts.serifBold,
    fontSize: 28,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  tapIcon: {
    marginBottom: 32,
  },
  // Mock card for step 2
  mockCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: SCREEN_W * 0.7,
    marginBottom: 16,
    alignItems: 'center',
    gap: 8,
  },
  mockWord: {
    fontFamily: fonts.sansBold,
    fontSize: 18,
    color: '#111827',
  },
  mockTranslation: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: '#6B7280',
  },
  mockSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 4,
  },
  mockSaveBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: '#fff',
  },
  arrowContainer: {
    marginBottom: 16,
  },
  // Footer
  footer: {
    alignItems: 'center',
    marginTop: 24,
    gap: 12,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 24,
  },
  btn: {
    backgroundColor: '#C4704B',
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 28,
  },
  btnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: '#fff',
  },
  skipBtn: {
    padding: 8,
  },
  skipText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
})
