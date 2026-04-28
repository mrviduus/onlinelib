# Slice 03 — Mobile bottom-tabs prominent upload

**Phase:** 1 (Upload UX fix) · **Estimated:** 1 day · **Risk:** low · **Flag:** `myBooksV2.mobileUploadTab`

## Goal

On mobile, make upload a top-level, one-tap action from any tab. Currently `my-books/upload` is reachable only via Library tab → empty-state CTA or "+" button (which mirrors the web problem).

Pattern: Instagram-style bottom tabs with a prominent center action button.

## Acceptance criteria

1. Bottom tab bar in `apps/mobile/app/(tabs)/_layout.tsx` shows 5 tabs in this order: **Read | Discover | + Upload | Library | Vocabulary**.
2. The center "+ Upload" tab is visually prominent: filled circle, accent color (orange matching web), "+" icon, raised slightly above the tab bar (Material FAB-style).
3. Tapping "+ Upload" does NOT navigate; instead it triggers `router.push('/my-books/upload')` as a modal-presented screen (existing behavior).
4. Profile tab moves out of the bottom bar — accessible via avatar in each tab's top header (currently in some tabs, ensure consistent across all).
5. The upload tab is hidden for unauthenticated users; in its place an empty cell, OR the bar collapses to 4 tabs (decide once during impl — keep symmetry, prefer 5-tab with disabled state showing Sign-in modal on tap).
6. Tapping "+ Upload" while inside the reader (`/read/...`) does NOT interrupt reading session — it presents modal over the reader, reader resumes on dismiss.
7. Behind feature flag `myBooksV2.mobileUploadTab` (read from API or hardcoded for first roll).

## Files to touch

| File | Change |
|---|---|
| `apps/mobile/app/(tabs)/_layout.tsx` | Reorder tabs; insert center upload tab with custom `tabBarButton` for raised styling. |
| `apps/mobile/src/components/UploadTabButton.tsx` | **New.** Custom button used as `tabBarButton`. Renders raised circle, handles tap. |
| `apps/mobile/app/my-books/upload.tsx` | No structural change. Confirm `presentation: 'modal'` in route options. |
| `apps/mobile/app/(tabs)/profile.tsx` | If exists as a tab, remove from `<Tabs>`. If profile is currently a tab, move to a stack route accessible via header avatar. |
| `apps/mobile/src/lib/features.ts` (create if missing) | Add `myBooksV2.mobileUploadTab` flag. |
| `apps/mobile/src/lib/telemetry.ts` | Emit `mobile.upload_tab.tapped` event. |
| `apps/mobile/src/locales/en.json` (or wherever i18n) | Tab label `tabs.upload`. |

## Implementation notes

**Custom raised tab button** — Expo Router uses React Navigation under the hood. Pattern:

```tsx
<Tabs.Screen
  name="upload"
  options={{
    tabBarLabel: 'Upload',
    tabBarIcon: ({ color }) => <Ionicons name="add-circle" size={48} color={color} />,
    tabBarButton: (props) => <UploadTabButton {...props} onPress={() => router.push('/my-books/upload')} />,
  }}
  listeners={{
    tabPress: (e) => {
      e.preventDefault()
      router.push('/my-books/upload')
    },
  }}
/>
```

The `listeners.tabPress` with `preventDefault` is what stops Expo Router from trying to navigate to a non-existent `(tabs)/upload` route. The actual screen is a modal at `app/my-books/upload.tsx`.

**Why a tab and not a FAB:** thumbs sit at the bottom on phones. A center tab is reachable from any hand position. A FAB on top-right requires a stretch. Bottom-center is the most ergonomic spot for the most important action.

**Hide for unauth:** wrap the tab definition in `useAuth().isAuthenticated &&`. React Navigation supports conditional `Tabs.Screen` rendering. Test that hiding/showing on auth state change does NOT crash.

**Tab order rationale:**
- Read (index, what user comes here for) — leftmost, still default
- Discover (search public catalog) — secondary discovery
- Upload — center, the main action
- Library (their stuff) — right of center
- Vocabulary — rightmost (less frequent than Library)

**Accessibility:**
- `accessibilityLabel="Upload a book"` on the upload tab button
- `accessibilityRole="button"` (not "tab" since it doesn't navigate to a tab page)
- Hit slop ≥ 44pt on the upload button

## Out of scope

- Drag-drop on mobile (no native concept, doesn't apply).
- Reader changes.
- Vocabulary tab redesign.
- Web changes.

## Tests

**Unit / component:**
- `UploadTabButton.test.tsx`: renders raised, calls `onPress` on tap, shows accent color.
- Auth-conditional rendering: tab hidden when unauth.

**E2E (Playwright Mobile, `apps/mobile/e2e/tests/upload-tab.spec.ts` — new file):**
- Open app → tap "+ Upload" tab from Read tab → modal opens with file picker.
- From Reader screen → tap "+ Upload" → modal opens, reader state preserved (test by dismissing modal and asserting same chapter/position).
- Unauth flow: launch logged out → upload tab disabled or shows sign-in.

## Done criterion

```bash
# 1. Tests
cd apps/mobile && npx tsc --noEmit
cd apps/mobile && npx jest --testPathPattern UploadTabButton  # if unit tests configured
cd apps/mobile && npx playwright test --grep "upload-tab"

# 2. Native build sanity
cd apps/mobile && npx expo prebuild --no-install   # both ios + android, no errors

# 3. Manual smoke on iOS simulator + Android emulator
# - Tab bar shows 5 tabs, center is raised orange circle
# - Tap upload from each tab → modal opens
# - Inside reader → tap upload → modal over reader → dismiss → reader still on same page
# - Sign out → upload tab disabled or hidden gracefully
```

## Rollback plan

Toggle `myBooksV2.mobileUploadTab` to `false`. Tab layout reverts to current 4-tab structure. Upload remains accessible via Library tab → empty-state CTA.

## Follow-ups

- After this ships, consider haptic feedback on upload tab tap (`expo-haptics` light impact).
- Long-press on upload tab → quick action sheet ("Upload book", "Paste URL", "From Files app") — Phase 4.
