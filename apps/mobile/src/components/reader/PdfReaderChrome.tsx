import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Animated, Keyboard } from 'react-native'
import { fonts } from '../../theme/typography'

interface Props {
  barBg: string
  barText: string
  borderColor: string
  barsAnim: Animated.Value
  footerTranslateY: Animated.AnimatedInterpolation<number>
  barsVisible: boolean
  bottomInset: number
  /** 1-based top-visible page. */
  currentPage: number
  /** Total pages (0 until the doc loads). */
  numPages: number
  /** Jump the viewer to a 1-based page (clamped inside the viewer). */
  onJumpToPage: (page: number) => void
}

/**
 * Footer chrome for the Original-layout PDF reader (ADR-012 S4c). Replaces the
 * reflow chapter-nav footer: a page-fraction progress bar, a "go to page" input
 * and the "N / total" indicator. Zoom/fit is intentionally omitted — the viewer
 * exposes no zoom message, so adding it would change the viewer contract (the
 * WebView already fit-scales to width + honours pinch). Page-jump routes through
 * the same `window.scrollToPage(n)` bridge the TOC and resume paths use.
 */
export function PdfReaderChrome({
  barBg, barText, borderColor, barsAnim, footerTranslateY, barsVisible,
  bottomInset, currentPage, numPages, onJumpToPage,
}: Props) {
  const [pageInput, setPageInput] = useState('')

  const submit = () => {
    const n = parseInt(pageInput, 10)
    if (Number.isFinite(n) && n >= 1) onJumpToPage(n) // viewer clamps overflow
    setPageInput('')
    Keyboard.dismiss()
  }

  const fraction = numPages >= 1 ? Math.min(1, currentPage / numPages) : 0

  return (
    <Animated.View
      style={[
        styles.footer,
        { backgroundColor: barBg, borderTopColor: borderColor, paddingBottom: bottomInset, opacity: barsAnim, transform: [{ translateY: footerTranslateY }] },
      ]}
      pointerEvents={barsVisible ? 'auto' : 'none'}
    >
      <View style={[styles.progressBar, { backgroundColor: borderColor }]}>
        <View style={[styles.progressFill, { width: `${Math.round(fraction * 100)}%`, backgroundColor: barText + '40' }]} />
      </View>
      <View style={styles.row}>
        <View style={styles.jumpWrap}>
          <TextInput
            style={[styles.input, { color: barText, borderColor: barText + '30' }]}
            value={pageInput}
            onChangeText={t => setPageInput(t.replace(/\D/g, ''))}
            onSubmitEditing={submit}
            placeholder={String(currentPage)}
            placeholderTextColor={barText + '66'}
            keyboardType="number-pad"
            returnKeyType="go"
            inputMode="numeric"
            maxLength={6}
            accessibilityLabel="Go to page"
          />
          <TouchableOpacity
            onPress={submit}
            style={[styles.goBtn, { borderColor: barText + '30' }]}
            accessibilityRole="button"
            accessibilityLabel="Go to page"
          >
            <Text style={[styles.goText, { color: barText + 'CC' }]}>Go</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.counter, { color: barText + '99' }]} accessibilityLabel={`Page ${currentPage} of ${numPages || '…'}`}>
          {currentPage} / {numPages || '…'}
        </Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  progressBar: { height: 4 },
  progressFill: { height: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, minHeight: 48 },
  jumpWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: {
    minWidth: 56,
    height: 34,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    fontFamily: fonts.sans,
    fontVariant: ['tabular-nums'],
  },
  goBtn: { height: 34, paddingHorizontal: 12, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 8 },
  goText: { fontSize: 13, fontFamily: fonts.sansMedium },
  counter: { fontSize: 13, fontFamily: fonts.sans, fontVariant: ['tabular-nums'] },
})
