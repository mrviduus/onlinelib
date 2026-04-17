# Mobile App — Bug Register

Полный срез багов и UX-дефектов мобильного приложения TextStack (Expo SDK 55 + React Native 0.83.2). Документ делится на три раздела: уже исправленное в этой и предыдущей сессиях, активные дефекты (с приоритетом P0–P3) и риски, требующие более глубокой проработки.

---

## 1. Уже исправлено

| ID | Область | Файл | Суть и решение |
|----|---------|------|----------------|
| B-01 | Reader / Selection | `app/reader/[bookSlug]/[chapterSlug].tsx` | WordCard позиционировался под футером при скрытом чтение-прогрессе — сделан `bottomOffset={footerHeight}`, не перекрывается. |
| B-02 | Reader / Highlights | `src/components/HighlightNoteModal.tsx` | На Android `Alert.prompt` был no-op; заменён на кросс-платформенный модал. |
| B-03 | Auth | `app.config.ts` / `AuthContext.tsx` | Google Sign-In padал из-за отсутствия webClientId в EAS config — добавлен. |
| B-04 | Reader / WebView | `src/lib/readerHtml.ts` | iOS `selectionchange` гонка — добавлен дебаунс + generation id. |
| B-05 | Dictionary/Translate | `useTargetLanguage.ts` | Язык цели брался из UI-locale, не из native language — добавлен хук. |
| B-06/07 | WordCard | `WordCard.tsx` | Некорректный выбор `from`-языка для определения/перевода. |
| B-08 | Auth | `src/context/AuthContext.tsx` | SecureStore fallback на web-сборках вылетал — вынесен в storage abstraction. |
| B-09 | Reader | `ReaderStatsWidget.tsx` | 1-секундный setInterval не чистился при размонтировании. |
| B-10 | Library/Vocab | `useAsyncResult.ts` | Race между вкладками библиотеки/словаря — универсальный хук с generation counter. |
| B-11 | Reader Settings | `ReaderSettingsDrawer.tsx` | Switch на Android рендерился невидимым — добавлены `trackColor`/`thumbColor`/`ios_backgroundColor`. |
| B-12 | Reader / Selection | `[chapterSlug].tsx`, `WordCard.tsx` | Повторный тап по тому же слову не сбрасывал auto-dismiss таймер — добавлен `selectionId`. |
| B-13 | Reader / WebView | `readerHtml.ts` | Длинные немецкие/украинские слова (>40) обрезались — лимит поднят до 80. |
| B-14 | TOC Sheet | `TocSheet.tsx` | `getItemLayout` врал при wrap'нутых заголовках — заменён на onScrollToIndexFailed. |
| B-15 | Home | `app/(tabs)/index.tsx` | Greeting slot замерзал из-за `useMemo([])` — заменено на `useState` + 60s interval. |
| B-16 | Navigation | `app/(tabs)/_layout.tsx` | Tab bar не учитывал safe-area bottom на iOS с home-indicator. |
| B-17 | Toast | `src/context/ToastContext.tsx` | Toast перекрывал таб-бар — добавлен `bottomOffset` + `defaultBottomOffset`. |
| B-18 | Profile / Avatar | `profile.tsx`, `packages/shared/src/api/auth.ts` | Единая копия "Upload failed" — теперь 413/415/401/5xx маппятся на конкретные сообщения. |
| B-19 | Search | `(tabs)/search.tsx` | Устаревшие ответы поиска затирали свежие — добавлен generation ref. |
| B-20 | ContinueReading | `components/ContinueReadingCard.tsx` | Сегменты роута `/my-books/read/[id]/[slug]` были перепутаны местами — пользователь не мог продолжить чтение. Исправлено. |
| B-21 | Reader / Bars | `readerHtml.ts` | Чтобы показать бары, требовалось ~20px хода вверх после перелома (baseline reset + threshold). Теперь любой первый пиксель вверх после down-рана показывает бары мгновенно, UP-threshold 6, DOWN-threshold 48. |
| B-22 | My Books polling | `app/my-books/[id].tsx` | `setInterval` молотил API каждые 5с даже при сбоях и разыменовывал `id!`. Переписан на recursive `setTimeout` с экспоненциальным backoff (5s → 10 → 20 → 40, cap 60), stop-on-terminal-status, unmount guard, toast после 3 подряд неудач. |
| B-23 | Search stale closure | `app/(tabs)/search.tsx` | `doSearch` замыкал устаревший `language` при смене native-lang. Перевели `saveRecent`/`removeRecent`/`clearRecent` на functional setState, `doSearch` теперь зависит только от `[language, saveRecent]`, `useEffect` тоже обновлён. |
| B-24 | Upload XHR | `app/my-books/upload.tsx` | При unmount запрос продолжался; network/413/415/401/5xx давали одно сообщение. Добавлены `xhrRef`-abort, Cancel-кнопка, `xhr.onabort` → `err.aborted=true`, `uploadErrorMessage(status)` маппер. |
| B-25 | Book detail error | `app/book/[slug].tsx` | Сбой `getBook` оставлял пустой экран. Добавлены `fetchError` state, UI с Retry/Go back, optimistic library toggle с rollback, wire `retryFailed` для failed chapters. |
| B-26 | Download retries | `src/context/DownloadContext.tsx` | Одна упавшая глава останавливала цикл. Добавлены `downloadChapter` с 3 попытками (400→1200→2400ms), трекинг `failedChapterSlugs`, `retryFailed(editionId)` только для недокаченных глав. |
| B-27 | Selection a11y | `src/components/SelectionActionBar.tsx` | Все `TouchableOpacity` без `accessibilityLabel`/`accessibilityRole`. Добавлены осмысленные labels ("Copy selection", "Look up in dictionary", "Translate selection", "Read selection aloud", "Mark word as known", "Highlight in {color}"), `accessibilityState` для speak/save. |
| B-28 | TOC scroll failure | `src/components/TocSheet.tsx` | `onScrollToIndexFailed` был no-op. Пробросили `listRef`, делаем `scrollToOffset(approxOffset)` → через 100ms retry `scrollToIndex(index)`. |
| B-29 | Bookmark rollback | `app/reader/[bookSlug]/[chapterSlug].tsx` | `deleteBookmark`/`toggleBookmark` снимали закладку из state даже при fail API. Теперь snapshot → optimistic remove → rollback + toast on error. |
| B-30 | Toast dead API | `src/context/ToastContext.tsx` | `setDefaultBottomOffset` экспортировался, но никуда не подключался. Удалён из контекста; per-call `bottomOffset` остался как основной способ. |
| B-31 | Haptics premature | `src/hooks/useHaptics.ts` | `enabled.current = true` до резолва AsyncStorage — буз даже при отключённой хаптике. Теперь дефолт `false` до загрузки; `toggle()` тоже помечает loaded. |
| B-32 | Reader effect deps | `app/reader/[bookSlug]/[chapterSlug].tsx` | Highlights/vocab effects зависели от `chapter` (reference), перезагружались при каждом refetch той же главы. Переключили на `chapter?.id` + cancellation flag. |
| B-33 | Shared API offline | `packages/shared/src/api/client.ts` | `fetch`-ошибки (offline/DNS) прилетали как сырой `TypeError`. Добавили `safeFetch` → `ApiError(0, …)` с `isNetworkError=true`; `errorFromResponse` читает body, чтобы после refresh-retry возвращать реальный статус/сообщение. |
| B-34 | Mobile refresh flow | `src/lib/api.ts` + `src/lib/authEvents.ts` + `AuthContext.tsx` | Server-reject refresh (4xx) молча чистил токены, но UI оставался "залогинен" и спамил 401. Ввели шину `authEvents`, latch против флуда, AuthContext чистит `user` только если мы всё ещё считались залогинены. Network-fail на refresh больше не выносит токены. |
| B-35 | Reading session lifecycle | `src/hooks/useReadingSession.ts` | Смена книги в пределах одного mount'а не ресетила `submittedRef`/счётчики — новая сессия никогда не сабмитилась. Heartbeat молотил и после сабмита. Теперь `sessionKey` effect ресетит стейт на смене книги, heartbeat no-op после сабмита, `updateProgress` не рaзоружает закрытую сессию. |
| B-36 | Reader HTML memoization | `app/reader/[bookSlug]/[chapterSlug].tsx` | `buildReaderHtml` пересчитывался на каждом рендере (bars toggle, progress tick) — CPU + потенциальный WebView reload. Обернул в `useMemo`, `source` тоже стабилизирован. |
| B-37 | Logout cache leak | `src/context/DownloadContext.tsx` | После sign-out в памяти оставались `downloads` Map и `cachedBooks` от прошлого пользователя. Теперь при `isAuthenticated: true → false` отменяем in-flight downloads и сбрасываем state (disk-cache остаётся — ключ по editionId, не user). |
| B-38 | Offline chapter listing | `src/lib/offlineDb.ts` | Не было способа перечислить закешированные главы для edition-а. Добавлен `listCachedChapters(editionId)` → `CachedChapterSummary[]` (slug/title/wordCount, сортировка по cachedAt для приблизительного сохранения порядка). |
| B-39 | Reader chapter race + offline UX | `app/reader/[bookSlug]/[chapterSlug].tsx` | (1) chapter-fetch effect не имел cancellation — быстрая смена глав могла записать устаревший chapter. (2) cache-hit путь не обновлял `wordCountRef.current` → ETA считался от предыдущей главы. (3) cache-miss оставлял `loading=false` + `chapter=null` → бесконечный спиннер. Теперь: `let cancelled = false`, `wordCountRef` апдейтится в обе ветки, новое state `chapterError: 'offline' \| 'notfound'` рендерит cloud-offline / help-circle UI с кнопкой "Go back". Book-resolution effect тоже получил cancellation + offline-fallback ставит `bookTitleRef`/setBookTitle. |
| B-40 | Book detail offline fallback | `app/book/[slug].tsx` | Любой network-fail сводил страницу к «Couldn't load this book», даже если книга полностью скачана. Теперь на catch (кроме 404) читаем `getAllCachedBooks()` + `listCachedChapters()` + `getLocalProgress()`, собираем минимальный `BookDetail` из cache, ставим `offlineMode=true`, рендерим баннер «You're offline» и прячем Rating/Moods/Reviews/EPUB/Library-toggle (им нужен сервер). Continue-slug поднимается из локального прогресса. |
| B-41 | Login keyboard polish | `app/(auth)/login.tsx` | Форма логина не имела `returnKeyType`/`textContentType`/autofill — iOS Keychain/Autofill не подцеплялись, Enter на последнем поле не отправлял форму, двойной тап на «Sign in» мог выстрелить два раза. Добавлены `emailRef`/`passwordRef`, `returnKeyType` ("next"/"go") + `onSubmitEditing` chain, `textContentType` (name/emailAddress/newPassword/password), `autoComplete` (password-new/password по режиму), `autoCorrect={false}`, `if (loading) return` guard в handleEmailAuth. |
| B-42 | Vocab reminder race | `src/lib/vocabReminder.ts` | VocabularyReviewCard focus-effect мог вызвать `schedule()` после того как профиль только что сделал `cancel()` — и наоборот. Notification-id терялся, уведомление либо дублировалось, либо не отменялось. Теперь `schedule()`/`cancel()` сериализуются через общий promise-chain queue (`opChain`), порядок операций гарантируется независимо от экрана. |
| B-43 | Logout cache leak | `src/context/AuthContext.tsx` + `src/lib/progressStorage.ts` | После sign-out в AsyncStorage оставались `vocab.stats.last.{userId}` и `reading.progress.{editionId}` — при входе другим юзером UI секунду показывал чужие цифры. Добавлены `clearVocabStatsCache()` и новый `clearAllLocalProgress()`; вызов обоих в `signOut()` и в `onAuthFailure` (catch no-op). |
| B-44 | TTS language hardcoded | `src/hooks/useTts.ts` + все call-sites (`reader/...`, `my-books/read/...`, `vocabulary.tsx`, `vocabulary/review.tsx`) | `useTts` всегда озвучивал через `en-US`, даже украинский текст. Добавлен `toBcp47(lang)` маппер (`en`→`en-US`, `uk`→`uk-UA`), сигнатура `speak(text, opts: TtsSpeakOptions \| number)` с back-compat для rate-only вызовов, `trackTtsPlayed({ language })` теперь передаёт реальный язык. Вызовы обновлены: reader — `{ rate, lang: language }`, vocabulary list — `{ lang: item.language }`, review — `{ lang: language }` (ReviewCardDto language pending backend). |
| B-45 | TTS unmount mid-speech | `src/hooks/useTts.ts` | Навигация с читалки во время `Speech.speak()` оставляла голос звучать поверх следующего экрана. Добавлен `speakingRef` + cleanup effect `return () => { if (speakingRef.current) Speech.stop() }`. |
| B-46 | Vocabulary review setState after unmount | `src/hooks/useVocabularyReview.ts` | `getReviewQueue` / `submitReview` могли резолвнуться уже после того как пользователь ушёл с экрана — React ругался warning'ом + мы тихо воскрешали сессию. Добавлен `mountedRef = useRef(true)` + effect, `if (!mountedRef.current) return` перед каждым setState в success/catch ветках `startSession` и `submitAnswer`. |
| B-47 | QuickStats cross-user leak | `src/hooks/useQuickStats.ts` | При sign-out хук не чистил `stats`, а при следующем sign-in новая promise могла проиграть старой. Теперь `!isAuthenticated` → `setStats(null)` + early return, promise обёрнута в `let cancelled = false` + cleanup. |
| B-48 | Reader settings async load race | `src/hooks/useReaderSettings.ts` | `AsyncStorage.getItem` + legacy v1 migration могли отрезолвиться после unmount или после того как пользователь успел нажать «A+» на дефолте — его правка затиралась. Добавлен `cancelled` flag на оба await'а (raw read + legacy fallback). |
| B-49 | P3 accessibility sweep | `src/components/{BookmarksSheet,DictionarySheet,TocSheet,TranslationSheet,HighlightNoteModal,ReaderSettingsDrawer}.tsx` | Сit-sheets и модалки не имели `onRequestClose` (Android back кнопка не закрывала), большинство close/speak/delete/row-кнопок — без `accessibilityRole`/`Label`/`State`. Пройдено по всем шести компонентам: Modal → `onRequestClose`, заголовки → `role="header"`, все TouchableOpacity/Pressable → `role="button"` + осмысленный label + `state.selected` для chip/row тогглов (TOC row, font/theme/align/TTS speed chips, toggle-bookmark). TextInput highlight note получил `accessibilityLabel`, ActivityIndicator — "Loading definition"/"Translating", error Text — `role="alert"`. |

---

## 2. Открытые дефекты

*Нет открытых дефектов P0–P3.* Все пункты из предыдущих срезов закрыты, см. таблицу выше (B-22..B-49). `tsc --noEmit` по всему `apps/mobile` проходит чисто.

---

## 3. Риски и области для более глубокой проверки

- ~~**`lib/api.ts` / refresh-token**~~ — закрыто B-34 (single-flight promise, latch против флуда, network-fail ≠ terminal).
- ~~**`useReadingSession`**~~ — закрыто B-35 (`clearAutoEndTimer`, `resetSessionState`, per-book `sessionKey`).
- ~~**`ThemeContext`**~~ — закрыто B-36 (`useMemo` на buildReaderHtml + webViewSource).
- ~~**Offline-first**~~ — закрыто B-38/B-39/B-40 (`listCachedChapters`, reader cancellation + error UI, book detail offline fallback с баннером).
- ~~**Auth logout cleanup**~~ — закрыто B-37 (in-flight downloads отменяются, `downloads`/`cachedBooks` state сбрасываются).
- **EAS/Android**: проверить что `expo-sharing` и `expo-file-system` новой версии совместимы с экспортом EPUB. (не тронуто — требует dev-build + девайса, не точечный фикс.)

---

## 4. Статус

Все ранее открытые P0–P3 исправлены в порядке: **P0-1 → P1-1 → P1-2 → P1-3 → P1-4 → P1-5 → P1-6 → P2-1 → P2-3 → P2-4 → P3-1 → P3-4**. Второй проход — senior-ревью рисков из §3: **R-1 (B-33/B-34) → R-2 (B-35) → R-3 (B-36) → R-5 (B-37) → R-4 (B-38/B-39/B-40)**. Третий проход — senior-аудит hooks/контекстов/UX-мелочей: **B-41 (login polish) → B-42 (vocab reminder race) → B-43 (logout cache leak) → B-44 (TTS lang) → B-45 (TTS unmount) → B-46 (vocab review unmount guard) → B-47 (QuickStats cross-user) → B-48 (reader settings race) → B-49 (a11y sweep по шести sheets/модалкам)**. Остался только R-6 (EAS/Android expo-sharing + expo-file-system совместимость при EPUB-экспорте) — требует реального dev-build и устройства, не point-fix. `tsc --noEmit` по всему `apps/mobile` проходит чисто после каждого батча.
