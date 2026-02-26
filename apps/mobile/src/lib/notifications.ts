import { Platform } from 'react-native'

const REVIEW_REMINDER_ID = 'vocab-review-reminder'

let _notifications: typeof import('expo-notifications') | null = null
let _notificationsChecked = false

function getNotifications() {
  if (Platform.OS === 'web') return null
  if (_notificationsChecked) return _notifications
  _notificationsChecked = true
  try {
    _notifications = require('expo-notifications')
  } catch {
    _notifications = null
  }
  return _notifications
}

/** Request notification permissions. Call once on first app open. */
export async function requestPermissions(): Promise<boolean> {
  try {
    const Notifications = getNotifications()
    if (!Notifications) return false
    const { status: existing } = await Notifications.getPermissionsAsync()
    if (existing === 'granted') return true
    const { status } = await Notifications.requestPermissionsAsync()
    return status === 'granted'
  } catch {
    return false
  }
}

/** Schedule a daily review reminder at the given hour (default 19:00). */
export async function scheduleReviewReminder(hour = 19) {
  try {
    const Notifications = getNotifications()
    if (!Notifications) return
    await cancelReviewReminder()
    await Notifications.scheduleNotificationAsync({
      identifier: REVIEW_REMINDER_ID,
      content: {
        title: 'Time to review!',
        body: 'You have vocabulary words due for review.',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute: 0,
      },
    })
  } catch {}
}

/** Cancel the review reminder. */
export async function cancelReviewReminder() {
  try {
    const Notifications = getNotifications()
    if (!Notifications) return
    await Notifications.cancelScheduledNotificationAsync(REVIEW_REMINDER_ID)
  } catch {}
}

/** Setup notification handler (foreground behavior). Call in root layout. */
export function setupNotifications() {
  try {
    const Notifications = getNotifications()
    if (!Notifications) return
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    })
  } catch {}
}
