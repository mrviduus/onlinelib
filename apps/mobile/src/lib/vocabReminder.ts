/**
 * Vocabulary review reminder — thin wrapper over expo-notifications.
 *
 * Why a dedicated module:
 *   1. Single place to own the notification *identifier* so reschedules don't
 *      pile up stale triggers.
 *   2. Graceful fallback to no-op when notifications aren't available
 *      (web, emulator without Google Play services, or before the package is
 *      installed via `npx expo install expo-notifications`).
 *   3. Keeps AsyncStorage persistence concerns out of the VocabularyReviewCard.
 *
 * Contract:
 *   await vocabReminder.ensurePermission()              // returns boolean
 *   await vocabReminder.schedule({ hour: 19, minute: 0, title, body })
 *   await vocabReminder.cancel()
 *   const s = await vocabReminder.getSettings()
 *   await vocabReminder.setSettings({ enabled, hour, minute })
 *
 * The consumer (e.g. VocabularyReviewCard) decides when to show a reminder
 * based on stats — this service just exposes the scheduling primitives.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

const SETTINGS_KEY = 'vocab.reminder.settings'
const NOTIFICATION_ID = 'vocab-review-daily'

export interface ReminderSettings {
  /** Master toggle. Default false so we never surprise-schedule on first run. */
  enabled: boolean
  /** 24h clock, 0–23. */
  hour: number
  /** 0–59. */
  minute: number
}

const DEFAULTS: ReminderSettings = { enabled: false, hour: 19, minute: 0 }

/**
 * Lazy-load expo-notifications so the module is optional at runtime.
 *
 * We intentionally avoid a static `import type` from 'expo-notifications'
 * here — the package is optional (added to package.json but not guaranteed
 * installed yet in every dev checkout). A static type reference would break
 * `tsc` for contributors who haven't run `npx expo install expo-notifications`.
 * At runtime the shape we care about (permissions, schedule, cancel) is
 * stable enough that `any` is acceptable inside this one module.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotificationsModule = any
let cached: NotificationsModule | null | undefined = undefined

function loadNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached
  // Notifications aren't meaningful on web in our flow — we skip entirely.
  if (Platform.OS === 'web') {
    cached = null
    return null
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as NotificationsModule
  } catch {
    // Package not installed yet — caller decides how to react.
    cached = null
  }
  return cached
}

/**
 * Serialize schedule/cancel operations so a focus-effect schedule() can never
 * complete *after* a profile-toggle cancel() and leave a zombie notification
 * armed. With multiple screens (Home card resets daily copy on focus, Profile
 * row toggles enabled, etc.) calling into this module independently, an unsync
 * version would race: read settings → user toggles off → cancel runs → our
 * schedule() lands. Last-write-wins via a per-module promise chain.
 */
let opChain: Promise<unknown> = Promise.resolve()
function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const next = opChain.then(op, op)
  // Swallow rejection on the chain itself so a single failure doesn't poison
  // every subsequent op. Callers still see their own rejection via `next`.
  opChain = next.catch(() => {})
  return next
}

async function getSettings(): Promise<ReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<ReminderSettings>
    return {
      enabled: Boolean(parsed.enabled),
      hour: clampInt(parsed.hour, 0, 23, DEFAULTS.hour),
      minute: clampInt(parsed.minute, 0, 59, DEFAULTS.minute),
    }
  } catch {
    return DEFAULTS
  }
}

async function setSettings(next: ReminderSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
}

/** Requests permission if not already granted. Returns true when granted. */
async function ensurePermission(): Promise<boolean> {
  const N = loadNotifications()
  if (!N) return false
  try {
    const { status: existing } = await N.getPermissionsAsync()
    if (existing === 'granted') return true
    const { status } = await N.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    } as any)
    return status === 'granted'
  } catch {
    return false
  }
}

interface ScheduleOptions {
  hour: number
  minute: number
  title: string
  body: string
}

/**
 * Schedule (or reschedule) the daily reminder. Always cancels any existing
 * instance first so we never end up with two triggers firing at 19:00.
 *
 * Serialized via `enqueue` — see opChain above.
 */
function schedule(opts: ScheduleOptions): Promise<boolean> {
  return enqueue(async () => {
    const N = loadNotifications()
    if (!N) return false
    const granted = await ensurePermission()
    if (!granted) return false
    try {
      await N.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => {})
      await N.scheduleNotificationAsync({
        identifier: NOTIFICATION_ID,
        content: {
          title: opts.title,
          body: opts.body,
          sound: 'default',
        },
        trigger: {
          // Repeat at the specified local time every day.
          type: 'daily' as any,
          hour: opts.hour,
          minute: opts.minute,
        } as any,
      })
      return true
    } catch {
      return false
    }
  })
}

function cancel(): Promise<void> {
  return enqueue(async () => {
    const N = loadNotifications()
    if (!N) return
    try {
      await N.cancelScheduledNotificationAsync(NOTIFICATION_ID)
    } catch {
      // Identifier may not exist — that's fine.
    }
  })
}

/** Whether expo-notifications is usable in this runtime. */
function isAvailable(): boolean {
  return loadNotifications() !== null
}

function clampInt(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const n = Math.round(value)
  if (n < min) return min
  if (n > max) return max
  return n
}

export const vocabReminder = {
  ensurePermission,
  schedule,
  cancel,
  getSettings,
  setSettings,
  isAvailable,
  NOTIFICATION_ID,
}
