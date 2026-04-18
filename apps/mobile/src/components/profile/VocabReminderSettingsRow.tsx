/**
 * Profile row: daily vocabulary review reminder.
 *
 * Two lines:
 *   • toggle (enable/disable + permission request)
 *   • time chips (Morning / Afternoon / Evening) — shown only when enabled
 *
 * Why chips instead of a full time picker:
 *   - No extra native dep (and no Android/iOS divergence)
 *   - Matches language/theme row style already present in Profile
 *   - Three meaningful choices covers 95% of intent; power users can ask
 *     for custom times later.
 */

import { useCallback, useEffect, useState } from 'react'
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { fonts } from '../../theme/typography'
import { vocabReminder, type ReminderSettings } from '../../lib/vocabReminder'
import { t } from '@textstack/shared'

interface TimeChoice {
  key: 'morning' | 'afternoon' | 'evening'
  hour: number
  minute: number
  labelKey: string
}

const TIME_CHOICES: TimeChoice[] = [
  { key: 'morning', hour: 8, minute: 0, labelKey: 'profile.vocabReminder.morning' },
  { key: 'afternoon', hour: 12, minute: 30, labelKey: 'profile.vocabReminder.afternoon' },
  { key: 'evening', hour: 19, minute: 0, labelKey: 'profile.vocabReminder.evening' },
]

function formatTime(hour: number, minute: number): string {
  const hh = String(hour).padStart(2, '0')
  const mm = String(minute).padStart(2, '0')
  return `${hh}:${mm}`
}

export function VocabReminderSettingsRow() {
  const { colors } = useTheme()
  const { language } = useLanguage()
  const [settings, setSettings] = useState<ReminderSettings | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    vocabReminder.getSettings()
      .then(s => { if (!cancelled) setSettings(s) })
      .catch(e => { if (!cancelled) console.warn('Reminder settings load failed:', e) })
    return () => { cancelled = true }
  }, [])

  const persist = useCallback(async (next: ReminderSettings) => {
    setSettings(next)
    await vocabReminder.setSettings(next)
  }, [])

  const applySchedule = useCallback(
    async (next: ReminderSettings) => {
      if (!next.enabled) {
        await vocabReminder.cancel()
        return
      }
      const ok = await vocabReminder.schedule({
        hour: next.hour,
        minute: next.minute,
        title: t(language, 'profile.vocabReminder.notificationTitle'),
        body: t(language, 'profile.vocabReminder.notificationBody'),
      })
      if (!ok) {
        Alert.alert(
          t(language, 'profile.vocabReminder.permissionDeniedTitle'),
          t(language, 'profile.vocabReminder.permissionDeniedBody'),
        )
        // Roll state back so UI matches reality.
        const reverted = { ...next, enabled: false }
        await persist(reverted)
      }
    },
    [language, persist],
  )

  const onToggle = useCallback(async () => {
    if (!settings || busy) return
    setBusy(true)
    try {
      if (!vocabReminder.isAvailable()) {
        Alert.alert(
          t(language, 'profile.vocabReminder.unavailableTitle'),
          t(language, 'profile.vocabReminder.unavailableBody'),
        )
        return
      }
      const next: ReminderSettings = { ...settings, enabled: !settings.enabled }
      await persist(next)
      await applySchedule(next)
    } finally {
      setBusy(false)
    }
  }, [settings, busy, language, persist, applySchedule])

  const onPickTime = useCallback(
    async (choice: TimeChoice) => {
      if (!settings || busy) return
      setBusy(true)
      try {
        const next: ReminderSettings = {
          ...settings,
          hour: choice.hour,
          minute: choice.minute,
        }
        await persist(next)
        if (next.enabled) await applySchedule(next)
      } finally {
        setBusy(false)
      }
    },
    [settings, busy, persist, applySchedule],
  )

  if (!settings) return null

  const activeChoice = TIME_CHOICES.find(
    c => c.hour === settings.hour && c.minute === settings.minute,
  )

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.row, { borderBottomColor: colors.border }]}
        onPress={onToggle}
        accessibilityRole="switch"
        accessibilityState={{ checked: settings.enabled, disabled: busy }}
        accessibilityLabel={t(language, 'profile.vocabReminder.label')}
        activeOpacity={0.7}
      >
        <Ionicons
          name="notifications-outline"
          size={20}
          color={colors.textSecondary}
          style={styles.icon}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>
            {t(language, 'profile.vocabReminder.label')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {settings.enabled
              ? formatTime(settings.hour, settings.minute)
              : t(language, 'profile.vocabReminder.offSubtitle')}
          </Text>
        </View>
        <View
          style={[
            styles.toggle,
            {
              backgroundColor: settings.enabled ? colors.primary : colors.border,
            },
          ]}
        >
          <View
            style={[
              styles.toggleDot,
              {
                transform: [{ translateX: settings.enabled ? 18 : 2 }],
              },
            ]}
          />
        </View>
      </TouchableOpacity>

      {settings.enabled ? (
        <View style={[styles.chipsRow, { borderBottomColor: colors.border }]}>
          {TIME_CHOICES.map(choice => {
            const selected = activeChoice?.key === choice.key
            return (
              <TouchableOpacity
                key={choice.key}
                onPress={() => onPickTime(choice)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? colors.primaryLight : 'transparent',
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                activeOpacity={0.7}
              >
                <Text
                  style={{
                    fontFamily: fonts.sansMedium,
                    fontSize: 13,
                    color: selected ? colors.primary : colors.textSecondary,
                  }}
                >
                  {t(language, choice.labelKey)} · {formatTime(choice.hour, choice.minute)}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  icon: { marginRight: 12 },
  title: { fontFamily: fonts.sans, fontSize: 16 },
  subtitle: { fontFamily: fonts.sans, fontSize: 12, marginTop: 2 },
  toggle: {
    width: 40,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    padding: 0,
  },
  toggleDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 10,
    paddingLeft: 32,
    borderBottomWidth: 1,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
})
