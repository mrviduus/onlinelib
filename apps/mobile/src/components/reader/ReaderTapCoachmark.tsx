/**
 * First-run coachmark teaching the core reader gesture: "tap a word to save
 * it to your vocabulary."
 *
 * Why this exists:
 *   The tap-to-save gesture is the single most important interaction in the
 *   reader, but it's invisible — there's no button that says "tap a word."
 *   Without this prompt, new users read whole chapters without discovering
 *   the vocabulary feature, which is the app's primary retention loop.
 *
 * Display rules:
 *   - Shown once per install (gated by AsyncStorage flag).
 *   - Delayed ~600ms after mount so it appears *after* the reader has
 *     finished loading and laying out — showing it over a blank screen would
 *     feel jarring.
 *   - Dismisses on tap anywhere, or via the explicit "Got it" CTA.
 *   - Uses a pulsing finger icon to hint at the physical gesture.
 *
 * This component is self-contained — it reads/writes its own AsyncStorage
 * flag and mounts/unmounts based on state. The parent just renders it
 * unconditionally inside the reader's overlay layer; the component decides
 * whether to be visible.
 */

import { useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { fonts } from '../../theme/typography'

const STORAGE_KEY = 'onboarding.readerTapHint.seen'
const SHOW_DELAY_MS = 600

export function ReaderTapCoachmark() {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const [visible, setVisible] = useState(false)
  const opacity = useRef(new Animated.Value(0)).current
  const fingerScale = useRef(new Animated.Value(1)).current
  // Hold a handle on the pulse loop so we can stop it on dismiss/unmount.
  // Without this, `Animated.loop` keeps running in the background after the
  // coachmark is hidden, retaining the Animated node and wasting a frame callback.
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null)

  useEffect(() => {
    let cancelled = false
    let delayTimer: ReturnType<typeof setTimeout> | null = null

    ;(async () => {
      try {
        const seen = await AsyncStorage.getItem(STORAGE_KEY)
        if (cancelled || seen === '1') return
        delayTimer = setTimeout(() => {
          if (cancelled) return
          setVisible(true)
          Animated.timing(opacity, {
            toValue: 1,
            duration: 240,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }).start()

          // Gentle pulse on the finger icon to communicate "tap".
          const pulse = Animated.loop(
            Animated.sequence([
              Animated.timing(fingerScale, {
                toValue: 1.12,
                duration: 700,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
              Animated.timing(fingerScale, {
                toValue: 1,
                duration: 700,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
            ]),
          )
          pulseRef.current = pulse
          pulse.start()
        }, SHOW_DELAY_MS)
      } catch (e) {
        // If AsyncStorage fails, default to not-shown rather than spamming
        // the coachmark every open.
        console.warn('Coachmark seen-check failed:', e)
      }
    })()

    return () => {
      cancelled = true
      if (delayTimer) clearTimeout(delayTimer)
      // Stop the pulse animation so it doesn't continue after unmount.
      if (pulseRef.current) {
        pulseRef.current.stop()
        pulseRef.current = null
      }
    }
  }, [opacity, fingerScale])

  const dismiss = () => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setVisible(false)
    })
    if (pulseRef.current) {
      pulseRef.current.stop()
      pulseRef.current = null
    }
    // Persist immediately — we don't want a double-show if they navigate away
    // during the fade-out animation.
    AsyncStorage.setItem(STORAGE_KEY, '1').catch(e => console.warn('Coachmark persist failed:', e))
  }

  if (!visible) return null

  return (
    <Animated.View
      pointerEvents="auto"
      style={[StyleSheet.absoluteFill, styles.backdrop, { opacity }]}
    >
      <Pressable
        onPress={dismiss}
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={t('reader.coachmarkDismiss')}
      />
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Animated.View
          style={[
            styles.fingerBubble,
            { backgroundColor: colors.primaryLight },
            { transform: [{ scale: fingerScale }] },
          ]}
        >
          <Ionicons name="hand-left" size={28} color={colors.primary} />
        </Animated.View>
        <Text style={[styles.title, { color: colors.text }]}>
          {t('reader.coachmarkTitle')}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {t('reader.coachmarkSubtitle')}
        </Text>
        <Pressable
          onPress={dismiss}
          style={[styles.cta, { backgroundColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel={t('reader.coachmarkDismiss')}
        >
          <Text style={styles.ctaLabel}>{t('reader.coachmarkDismiss')}</Text>
        </Pressable>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 1000,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  fingerBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontFamily: fonts.serifBold,
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 18,
  },
  cta: {
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 22,
  },
  ctaLabel: {
    color: '#fff',
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
})
