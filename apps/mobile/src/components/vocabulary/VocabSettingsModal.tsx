import { useEffect, useState } from 'react'
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  Switch, ScrollView, ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { vocabularyApi } from '@textstack/shared'
import type { VocabSettingsDto } from '@textstack/shared'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { fonts } from '../../theme/typography'

interface Props {
  visible: boolean
  onClose: () => void
  onSaved?: () => void
}

const DAILY_CAP_MIN = 5
const DAILY_CAP_MAX = 100
const WEEKLY_BUDGET_MIN = 10
const WEEKLY_BUDGET_MAX = 500

const parseIntStrict = (s: string): number | null => {
  if (!/^\d+$/.test(s)) return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : null
}

export function VocabSettingsModal({ visible, onClose, onSaved }: Props) {
  const { colors } = useTheme()
  const { t } = useLanguage()
  const [settings, setSettings] = useState<VocabSettingsDto | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dailyCapText, setDailyCapText] = useState('')
  const [weeklyBudgetText, setWeeklyBudgetText] = useState('')

  useEffect(() => {
    if (!visible) return
    let mounted = true
    setError(null)
    setSettings(null)
    vocabularyApi.getVocabSettings()
      .then(s => {
        if (!mounted) return
        setSettings(s)
        setDailyCapText(String(s.dailyNewCap))
        setWeeklyBudgetText(String(s.weeklyReviewBudget))
      })
      .catch(() => { if (mounted) setError(t('vocabulary.settings.loadFailed')) })
    return () => { mounted = false }
  }, [visible, t])

  const patch = (p: Partial<VocabSettingsDto>) => {
    setSettings(prev => prev ? { ...prev, ...p } : prev)
  }

  const handleSave = async () => {
    if (!settings) return
    const dailyCap = parseIntStrict(dailyCapText)
    if (dailyCap === null || dailyCap < DAILY_CAP_MIN || dailyCap > DAILY_CAP_MAX) {
      setError(t('vocabulary.settings.dailyCapRange'))
      return
    }
    const weeklyBudget = parseIntStrict(weeklyBudgetText)
    if (weeklyBudget === null || weeklyBudget < WEEKLY_BUDGET_MIN || weeklyBudget > WEEKLY_BUDGET_MAX) {
      setError(t('vocabulary.settings.weeklyBudgetRange'))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload: VocabSettingsDto = {
        ...settings,
        dailyNewCap: dailyCap,
        weeklyReviewBudget: weeklyBudget,
      }
      const saved = await vocabularyApi.updateVocabSettings(payload)
      setSettings(saved)
      onSaved?.()
      onClose()
    } catch {
      setError(t('vocabulary.settings.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const onChangeDigits = (setter: (v: string) => void) => (v: string) => {
    setter(v.replace(/[^\d]/g, ''))
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.text, fontFamily: fonts.sansMedium }]}>
              {t('vocabulary.settings.title')}
            </Text>
            <TouchableOpacity onPress={onClose} disabled={saving} style={styles.closeBtn} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={[styles.subtitle, { color: colors.textSecondary, fontFamily: fonts.sans }]}>
              {t('vocabulary.settings.subtitle')}
            </Text>

            {settings === null && !error ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <>
                {error && (
                  <View style={[styles.errorBox, { borderColor: '#ef4444' }]}>
                    <Text style={[styles.errorText, { fontFamily: fonts.sans }]}>{error}</Text>
                  </View>
                )}

                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.text, fontFamily: fonts.sansMedium }]}>
                    {t('vocabulary.settings.dailyNewCap')}
                  </Text>
                  <Text style={[styles.hint, { color: colors.textSecondary, fontFamily: fonts.sans }]}>
                    {t('vocabulary.settings.dailyNewCapHint')}
                  </Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, fontFamily: fonts.sans }]}
                    value={dailyCapText}
                    onChangeText={onChangeDigits(setDailyCapText)}
                    keyboardType="number-pad"
                    maxLength={3}
                    editable={!saving && !!settings}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.text, fontFamily: fonts.sansMedium }]}>
                    {t('vocabulary.settings.weeklyBudget')}
                  </Text>
                  <Text style={[styles.hint, { color: colors.textSecondary, fontFamily: fonts.sans }]}>
                    {t('vocabulary.settings.weeklyBudgetHint')}
                  </Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, fontFamily: fonts.sans }]}
                    value={weeklyBudgetText}
                    onChangeText={onChangeDigits(setWeeklyBudgetText)}
                    keyboardType="number-pad"
                    maxLength={3}
                    editable={!saving && !!settings}
                  />
                </View>

                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: colors.text, fontFamily: fonts.sansMedium }]}>
                      {t('vocabulary.settings.frequencyFilter')}
                    </Text>
                    <Text style={[styles.hint, { color: colors.textSecondary, fontFamily: fonts.sans }]}>
                      {t('vocabulary.settings.frequencyFilterHint')}
                    </Text>
                  </View>
                  <Switch
                    value={!!settings?.frequencyFilterEnabled}
                    onValueChange={v => patch({ frequencyFilterEnabled: v })}
                    disabled={saving || !settings}
                  />
                </View>

                <View style={styles.toggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: colors.text, fontFamily: fonts.sansMedium }]}>
                      {t('vocabulary.settings.autoRetire')}
                    </Text>
                    <Text style={[styles.hint, { color: colors.textSecondary, fontFamily: fonts.sans }]}>
                      {t('vocabulary.settings.autoRetireHint')}
                    </Text>
                  </View>
                  <Switch
                    value={!!settings?.autoRetireEnabled}
                    onValueChange={v => patch({ autoRetireEnabled: v })}
                    disabled={saving || !settings}
                  />
                </View>
              </>
            )}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              onPress={onClose}
              disabled={saving}
              style={[styles.btn, styles.cancelBtn, { borderColor: colors.border, opacity: saving ? 0.6 : 1 }]}
            >
              <Text style={[styles.cancelText, { color: colors.textSecondary, fontFamily: fonts.sansMedium }]}>
                {t('common.cancel')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving || !settings}
              style={[styles.btn, styles.saveBtn, { backgroundColor: colors.primary, opacity: (saving || !settings) ? 0.6 : 1 }]}
            >
              <Text style={[styles.saveText, { fontFamily: fonts.sansMedium }]}>
                {saving ? t('common.saving') : t('common.save')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  title: { fontSize: 17 },
  closeBtn: { padding: 4 },
  body: { padding: 16, gap: 16 },
  subtitle: { fontSize: 13, lineHeight: 18 },
  loading: { paddingVertical: 32, alignItems: 'center' },
  errorBox: { padding: 10, borderRadius: 8, borderWidth: 1, backgroundColor: '#fef2f2' },
  errorText: { color: '#b91c1c', fontSize: 13 },
  field: { gap: 6 },
  label: { fontSize: 14 },
  hint: { fontSize: 12, lineHeight: 16 },
  input: {
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footer: {
    flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1,
  },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  cancelBtn: { borderWidth: 1 },
  cancelText: { fontSize: 14 },
  saveBtn: {},
  saveText: { color: '#fff', fontSize: 14 },
})
