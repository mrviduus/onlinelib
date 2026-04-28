// Mobile UI feature flags. Expo exposes env vars prefixed with EXPO_PUBLIC_* at build time.
// Defaults match what users currently see — flip via `EXPO_PUBLIC_*` in EAS secrets / `.env.local`.

import AsyncStorage from '@react-native-async-storage/async-storage'

function readBool(v: unknown, fallback = false): boolean {
  if (typeof v !== 'string') return fallback
  const s = v.trim().toLowerCase()
  if (s === '1' || s === 'true' || s === 'yes' || s === 'on') return true
  if (s === '0' || s === 'false' || s === 'no' || s === 'off') return false
  return fallback
}

export const FEATURES = {
  // Mobile reader overlay v2 (foliate-js SVG overlayer inside the WebView).
  // Default ON — already shipped to 100% of users via hardcoded `overlayV2: true`.
  // Flip OFF via env if a regression surfaces; per-device override via AsyncStorage below.
  readerOverlayV2: readBool(process.env.EXPO_PUBLIC_READER_OVERLAY_V2, true),
  // My Books v2 — Continue Reading shelf at top of Library (Phase 2 / slice 05).
  myBooksV2ContinueReading: readBool(process.env.EXPO_PUBLIC_MYBOOKS_V2_CONTINUE_READING, true),
  // My Books v3 — header/tab reframe (Home/Discover/+/Library/Vocab on mobile).
  // Default OFF in prod; enable AFTER slice 04 ships smart shelves on /home.
  myBooksV3HeaderReframe: readBool(process.env.EXPO_PUBLIC_MYBOOKSV3_HEADER_REFRAME, false),
  // My Books v3 slice 02 — smart shelves at top of Library (4 shelves: Continue / Recently added / Quick reads / Finished this month).
  myBooksV3LibraryShelves: readBool(process.env.EXPO_PUBLIC_MYBOOKSV3_LIBRARY_SHELVES, false),
  // My Books v3 slice 03 — Library sidebar drawer (source/tags/collections filters replace Saved/Uploads tabs).
  myBooksV3LibrarySidebar: readBool(process.env.EXPO_PUBLIC_MYBOOKSV3_LIBRARY_SIDEBAR, false),
  // My Books v3 slice 04 — Status as primary horizontal tabs (Reading/Finished/Not started/Failed/All).
  myBooksV3StatusTabsPrimary: readBool(process.env.EXPO_PUBLIC_MYBOOKSV3_STATUS_TABS_PRIMARY, false),
} as const

export type FeatureKey = keyof typeof FEATURES

// Per-device override for reader overlay v2. Mirrors web's localStorage cascade
// so support can flip a single user back to legacy without a build:
//   AsyncStorage.setItem('textstack.readerOverlayV2', '0')  // killswitch
//   AsyncStorage.setItem('textstack.readerOverlayV2', '1')  // force on
// Anything else (null / unset) falls back to the build-time default.
export const READER_OVERLAY_V2_STORAGE_KEY = 'textstack.readerOverlayV2'

export function resolveReaderOverlayV2Active(stored: string | null): boolean {
  if (stored === '0') return false
  if (stored === '1') return true
  return FEATURES.readerOverlayV2
}

export async function readReaderOverlayV2Active(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(READER_OVERLAY_V2_STORAGE_KEY)
    return resolveReaderOverlayV2Active(v)
  } catch {
    return FEATURES.readerOverlayV2
  }
}
