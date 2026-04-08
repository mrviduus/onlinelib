# Homepage First Experience (Demo Book — Alice)

## Контекст

Homepage сейчас пассивная библиотека. Цель — за 1 клик открыть ридер с Alice ch1, показать онбординг, дать попробовать vocab, мягко подвести к регистрации.

Demo book: `alices-adventures-in-wonderland`, ch1: `2-down-the-rabbit-hole`

---

## Фаза 1: Конфиг демо-книги

- [ ] Создать `apps/web/src/config/demoBook.ts`

```ts
export const DEMO_BOOK = {
  bookSlug: 'alices-adventures-in-wonderland',
  chapterSlug: '2-down-the-rabbit-hole',
  language: 'en',
} as const
```

---

## Фаза 2: GuestLimitsContext

- [ ] Создать `apps/web/src/context/GuestLimitsContext.tsx`
- [ ] Создать `apps/web/src/hooks/useGuestLimits.ts`
- [ ] Обернуть `AppRoutes` в `App.tsx` внутри `AuthProvider`

localStorage ключ: `guest.state.v1`

State:
```ts
interface GuestState {
  pagesRead: number           // макс 3
  savedWords: GuestWord[]     // макс 10
  practiceSessionsUsed: number // макс 1
  hasSeenOnboarding: boolean
  currentBook: { bookSlug: string; chapterSlug: string } | null
  lastVisitAt: string | null
}
```

Context API:
- `isPageLimitReached`, `isWordLimitReached`, `isPracticeLimitReached`
- `incrementPages()` → false если лимит
- `addGuestWord()` → false если лимит
- `incrementPractice()` → false если лимит
- `markOnboardingSeen()`, `setCurrentBook()`, `resetGuestState()`
- `isReturningUser`

Активен только для `!isAuthenticated`.

---

## Фаза 3: Hero Section

- [ ] Изменить `apps/web/src/components/home/HeroSection.tsx`
- [ ] Обновить `apps/web/src/styles/home.css`
- [ ] Добавить ключи в `apps/web/src/locales/en.json`
- [ ] Добавить ключи в `apps/web/src/locales/uk.json`

Для гостей:
- Subtitle: "Tap any word to translate. Build vocabulary as you read."
- Primary CTA: `[ Start reading instantly ]` → `/{lang}/books/alices-adventures-in-wonderland/2-down-the-rabbit-hole`
- Secondary CTA: `[ Upload your book ]` → upload flow

Для returning guest:
- Primary CTA: `[ Continue where you left off ]` → сохранённая книга/глава

Для залогиненных: без изменений.

Стиль: Apple-like pill buttons, минимализм.

---

## Фаза 4: Reader Onboarding Overlay

- [ ] Создать `apps/web/src/components/reader/ReaderOnboarding.tsx`
- [ ] Создать `apps/web/src/styles/reader-onboarding.css`
- [ ] Интегрировать в `ReaderPage.tsx`

2 шага:
1. "Tap any word to see its translation"
2. "Your words are saved automatically"

localStorage ключ: `reader.onboarding.seen`
- Работает для всех (гости + залогиненные)
- Dismiss: Escape, клик вне, или "Got it"

---

## Фаза 5: Гостевое сохранение слов

- [ ] Изменить `apps/web/src/hooks/useReaderVocabulary.ts`

Для `!isAuthenticated`:
- Загрузить vocabMap из `guestState.savedWords`
- `addWord()` → `addGuestWord()` вместо API
- `removeWord()` → удалить из `guestState.savedWords`
- При лимите → signal для paywall
- VocabWordLayer подчёркивания работают для гостей

---

## Фаза 6: Soft Paywall Overlay

- [ ] Создать `apps/web/src/components/SoftPaywall.tsx`
- [ ] Добавить стили

Triggers:
- `pages`: "You've explored the demo. Sign in to keep reading."
- `words`: "You've saved 10 words. Sign in for unlimited vocabulary."
- `practice`: "Free practice done. Sign in for unlimited review."

CTAs:
- `[ Continue with Google ]` → `openAuthModal()`
- `[ Maybe later ]` → dismiss

Интеграция:
- ReaderPage: `incrementPages()` → false → paywall
- useReaderVocabulary: `addGuestWord()` → false → paywall
- PracticePage: `isPracticeLimitReached` → paywall

---

## Фаза 7: Returning User

- [ ] Уже покрыто Hero Section (Фаза 3)
- [ ] Опциональный toast в ридере: "Welcome back!"

Прогресс уже сохраняется в localStorage через `useReadingProgress`.

---

## Фаза 8: Миграция после логина

- [ ] Создать `apps/web/src/hooks/useGuestMigration.ts`
- [ ] Вызвать в `App.tsx` или `GuestLimitsContext`

Когда `isAuthenticated` → true:
1. Читает `guest.state.v1`
2. Для каждого слова → `saveWord()` API
3. `resetGuestState()`
4. Toast: "Your saved words have been synced"

---

## Порядок

1. Фаза 1 — конфиг
2. Фаза 2 — GuestLimitsContext
3. Фаза 3 — Hero Section
4. Фаза 5 — гостевой vocab
5. Фаза 4 — онбординг
6. Фаза 6 — soft paywall
7. Фаза 7 — returning user
8. Фаза 8 — миграция

---

## Файлы

Новые (7):
- `apps/web/src/config/demoBook.ts`
- `apps/web/src/context/GuestLimitsContext.tsx`
- `apps/web/src/hooks/useGuestLimits.ts`
- `apps/web/src/hooks/useGuestMigration.ts`
- `apps/web/src/components/reader/ReaderOnboarding.tsx`
- `apps/web/src/components/SoftPaywall.tsx`
- `apps/web/src/styles/reader-onboarding.css`

Изменяемые (7):
- `apps/web/src/App.tsx`
- `apps/web/src/components/home/HeroSection.tsx`
- `apps/web/src/styles/home.css`
- `apps/web/src/locales/en.json`
- `apps/web/src/locales/uk.json`
- `apps/web/src/hooks/useReaderVocabulary.ts`
- `apps/web/src/pages/ReaderPage.tsx`

---

## Верификация

1. `localhost:5173` incognito → Hero с CTA
2. "Start reading instantly" → ридер Alice ch1
3. Онбординг hints → dismiss → не повторяются
4. Тап слово → перевод → сохранение (до 10)
5. Листание → после 3 страниц → paywall
6. "Continue with Google" → auth modal
7. Логин → слова мигрируют
8. Повторный визит → "Continue where you left off"
9. Залогиненный → homepage без изменений

---

## Открытые вопросы

- Убрать StatsBar/RecentBooks/RecentAuthors с homepage для гостей?
- "Upload your book" CTA → куда ведёт для гостя? (LibraryPage требует auth)
- Лимит 3 pages — pagination pages или chapter transitions в scroll mode?
