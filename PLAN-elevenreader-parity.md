# TextStack: Roadmap to ElevenReader-level Product

**Дата**: 16 апреля 2026
**Образец**: [elevenreader.io](https://elevenreader.io/)
**Наш продукт**: [textstack.app](https://textstack.app/)
**Модель**: Free сейчас, $4.99/мес после запуска мобильного приложения

---

## Текущее состояние TextStack

### Что уже есть (сильные стороны)

- **Ридер с переводом**: Tap-to-translate, 18+ языков, словарь, произношение
- **SRS-карточки**: 5 стадий, multiple choice, LLM-distractors (Ollama/qwen3)
- **Каталог книг**: 146 книг, 47 авторов, 20 жанров, SEO-страницы
- **Загрузка своих книг**: EPUB, PDF, FB2 — полный пайплайн парсинга
- **TTS**: Edge TTS (200+ голосов), двухуровневый кеш (сервер + IndexedDB)
- **Читательская статистика**: Сессии, стрики, цели, 20 достижений, heatmap
- **Оффлайн**: IndexedDB кеш, скачивание книг
- **Блог**: SEO-контент, комменты, лайки
- **Мобильное приложение**: Expo 55, React Native, 29 экранов (в разработке)
- **Инфраструктура**: SSG, Meilisearch, авто-публикация, SEO backfill, CodeGen

### Что есть у ElevenReader, чего нет у нас

| Фича ElevenReader | У нас | Приоритет |
|---|---|---|
| Chrome-расширение | Нет | Высокий |
| Импорт статей по URL | Нет | Высокий |
| Pricing page / Freemium | Нет | Высокий |
| Social proof (отзывы, пресса) | Только Fazier badge | Высокий |
| Таблица сравнения с конкурентами | Нет | Средний |
| FAQ на лендинге | Нет | Высокий |
| Выбор голоса с UI/превью | TTS есть, UI выбора минимальный | Средний |
| Подсветка слов при TTS | Нет | Высокий |
| Sleep timer | Нет | Средний |
| Скорость до 4.0x | Есть 0.75x-2.0x | Низкий |
| Sync web <-> mobile | Частично (API) | Высокий |
| Реферальная программа | Нет | Средний |
| For Authors программа | Нет | Низкий |
| Мобильные приложения (Store) | В разработке | Критический |
| Промо-видео | Нет | Средний |

---

## Фаза 1: Лендинг и маркетинг (2-3 недели)

> Цель: привести лендинг к уровню ElevenReader по social proof и конверсии. Это можно делать параллельно с другими фазами и даёт быстрый результат.

### 1.1 Секция отзывов пользователей

**Что делаем**: Карусель с отзывами (как у ElevenReader — цитата + имя + роль).

**Где**: `apps/web/src/components/home/TestimonialsSection.tsx`

**Как**:
- Новый компонент-карусель (Swiper или свой на CSS scroll-snap)
- Данные: JSON-массив в `apps/web/src/data/testimonials.ts`
- Собрать реальные отзывы: попросить активных пользователей, добавить скриншоты из будущих store-отзывов
- Если реальных отзывов пока нет — начать с 2-3 бета-тестеров

**API-изменения**: Нет, статика на фронте.

**Файлы**:
- Создать: `apps/web/src/components/home/TestimonialsSection.tsx`
- Создать: `apps/web/src/data/testimonials.ts`
- Изменить: `apps/web/src/pages/HomePage.tsx` — добавить секцию между FeaturesSection и RecentBooksSection

### 1.2 FAQ-секция на лендинге

**Что делаем**: Accordion с 8-10 вопросами (аналог ElevenReader FAQ).

**Где**: `apps/web/src/components/home/FaqSection.tsx`

**Вопросы для FAQ**:
- Что такое TextStack?
- Это бесплатно?
- Какие языки поддерживаются?
- Как работает перевод по тапу?
- Могу ли я загрузить свои книги?
- Как работают карточки SRS?
- Работает ли оффлайн?
- Есть ли мобильное приложение?
- Как отличается от Kindle/Speechify/LingQ?

**Файлы**:
- Создать: `apps/web/src/components/home/FaqSection.tsx`
- Создать: `apps/web/src/data/faq.ts` (локализованные данные)
- Обновить: `apps/web/src/locales/en.json`, `uk.json` — добавить ключи FAQ
- Изменить: `apps/web/src/pages/HomePage.tsx`

### 1.3 Таблица сравнения с конкурентами

**Что делаем**: Таблица на лендинге или отдельной странице — TextStack vs LingQ vs Kindle vs Speechify.

**Где**: `apps/web/src/components/home/ComparisonSection.tsx`

**Колонки**: Перевод по тапу, SRS-карточки, загрузка своих книг, TTS, оффлайн, цена. У TextStack все галочки зеленые + Free.

**Файлы**:
- Создать: `apps/web/src/components/home/ComparisonSection.tsx`
- Изменить: `apps/web/src/pages/HomePage.tsx`

### 1.4 Обновление Hero-секции

**Что делаем**: Усилить hero — добавить превью мобильного приложения (мокап iPhone с ридером), анимацию перевода по тапу.

**Где**: `apps/web/src/components/home/HeroSection.tsx`

**Как у ElevenReader**: У них есть мокап телефона с анимацией прямо в hero. Нам нужен подобный элемент, демонстрирующий core feature — перевод по тапу слова.

### 1.5 Счётчик статистики

**Что делаем**: Расширить `StatsBar.tsx` — добавить живые числа: пользователей, слов изучено, книг прочитано.

**Бэкенд**: Новый endpoint `GET /api/site/stats` — возвращает агрегированные публичные метрики.

**Файлы**:
- Изменить: `apps/web/src/components/home/StatsBar.tsx`
- Создать: `backend/src/Api/Endpoints/SiteStatsEndpoints.cs`

---

## Фаза 2: Продуктовые фичи для ридера (3-4 недели)

> Цель: подтянуть ридер до уровня ElevenReader по прослушиванию и удобству. Эти фичи увеличивают retention.

### 2.1 Подсветка слов при TTS (Word Highlighting)

**Что делаем**: При прослушивании текста — текущее слово подсвечивается, как у ElevenReader.

**Как**:
- Edge TTS возвращает word-level timestamps через WebSocket (SSML word boundary events)
- Нужно парсить `WordBoundary` сообщения из WebSocket и маппить на DOM-элементы
- Фронт: обновить `useTts.ts` для приёма timestamps, `ReaderHighlights.tsx` для подсветки

**Бэкенд** (`backend/src/Tts/TextStack.Tts/EdgeTtsClient.cs`):
- Расширить WebSocket клиент: парсить `audio.metadata` сообщения с `WordBoundary`
- Возвращать JSON с timestamps рядом с аудио (новый endpoint или WebSocket)

**Новый endpoint**: `GET /api/tts/stream?text=&lang=&voice=` — WebSocket, стримит аудио чанки + word boundary events

**Файлы**:
- Изменить: `backend/src/Tts/TextStack.Tts/EdgeTtsClient.cs` — парсинг WordBoundary
- Создать: `backend/src/Api/Endpoints/TtsStreamEndpoints.cs` — WebSocket endpoint
- Изменить: `apps/web/src/hooks/useTts.ts` — поддержка timestamps
- Изменить: `apps/web/src/components/reader/ReaderHighlights.tsx` — подсветка

### 2.2 Импорт статей по URL

**Что делаем**: Пользователь вставляет URL → бэкенд извлекает текст → создаёт UserBook.

**Как**:
- Бэкенд: HTTP запрос → Readability (через .NET библиотеку SmartReader или аналог) → извлечение статьи → создание UserBook с одной главой
- Фронт: поле ввода URL на странице Library или в модалке

**Бэкенд**:
- Новый сервис: `Application/UserBooks/ArticleImportService.cs`
- Использовать SmartReader NuGet пакет для extraction
- Новый endpoint: `POST /me/books/import-url` — принимает `{ url: string }`
- Создаёт UserBook + UserChapter из извлечённого HTML

**Фронт**:
- Добавить в LibraryPage.tsx кнопку "Import from URL"
- Модалка с полем ввода URL и превью (title, image, excerpt)

**Файлы**:
- Создать: `backend/src/Application/UserBooks/ArticleImportService.cs`
- Изменить: `backend/src/Api/Endpoints/UserBookEndpoints.cs` — новый endpoint
- Изменить: `apps/web/src/pages/LibraryPage.tsx` — UI для импорта
- Создать: `apps/web/src/components/library/ImportUrlModal.tsx`

### 2.3 Улучшенный UI выбора голоса TTS

**Что делаем**: Как у ElevenReader — карточки голосов с тегами (Warm/British, Soft/American) и кнопкой прослушать превью.

**Как**:
- Уже есть `GET /api/tts/voices?lang=` с 200+ голосами
- Добавить метаданные: gender, accent, style tag — на бэке или захардкодить top-20 голосов с описаниями
- Фронт: новый компонент VoiceSelector вместо простого dropdown

**Файлы**:
- Создать: `apps/web/src/components/reader/VoiceSelector.tsx`
- Создать: `apps/web/src/data/voiceProfiles.ts` — метаданные для популярных голосов
- Изменить: `apps/web/src/components/reader/ReaderSettingsDrawer.tsx` — использовать VoiceSelector

### 2.4 Sleep Timer

**Что делаем**: Таймер, который останавливает TTS через N минут.

**Как**: Чисто фронтенд — таймер в `useTts.ts`, UI в ReaderSettingsDrawer.

**Варианты**: 5, 10, 15, 30, 45, 60 минут, "до конца главы".

**Файлы**:
- Изменить: `apps/web/src/hooks/useTts.ts` — логика таймера
- Изменить: `apps/web/src/components/reader/ReaderSettingsDrawer.tsx` — UI

### 2.5 Расширение скорости TTS до 4.0x

**Что делаем**: Расширить текущий диапазон 0.75x-2.0x до 4.0x.

**Где**: `apps/web/src/hooks/useReaderSettings.ts` — изменить max значение speed.

**Бэкенд**: `GET /api/tts?speed=` уже поддерживает параметр — нужно проверить что Edge TTS корректно работает на высоких скоростях.

---

## Фаза 3: Chrome-расширение (2-3 недели)

> Цель: убийственная фича для language learner'ов — переводить слова на любом сайте и добавлять в словарь.

### 3.1 Архитектура расширения

**Что делаем**: Chrome Extension с Manifest V3.

**Функционал**:
1. Тап/клик на слово → popup с переводом + определением + произношением
2. Кнопка "Save to vocabulary" → сохраняет в TextStack SRS
3. Кнопка "Read page" → открывает страницу в TextStack ридере (через import URL)
4. TTS прямо в расширении

**Архитектура**:
```
Chrome Extension (Manifest V3)
├── content-script.js    — инжектит в каждую страницу, слушает клики по словам
├── popup/               — UI расширения (настройки, логин)
├── background.js        — service worker, API-вызовы к textstack.app/api
└── styles.css           — стили для popup перевода
```

**API**: Все существующие endpoints уже подходят:
- `POST /translate` — перевод
- `GET /dictionary/{lang}/{word}` — определение
- `GET /api/tts?text=&lang=` — произношение
- `POST /me/vocabulary/words` — сохранение слова
- `POST /me/books/import-url` — импорт страницы (из Фазы 2.2)

**Auth**: Расширение хранит JWT в `chrome.storage.local`, рефрешит через `/auth/refresh`.

**Файлы**:
- Создать: `apps/chrome-extension/` — новый пакет
- `manifest.json`, `content-script.ts`, `background.ts`, `popup/`
- `tsconfig.json`, `package.json`, `vite.config.ts` (сборка)

### 3.2 Разработка MVP расширения

**Минимальный функционал**:
1. Двойной клик на слово → popup с переводом
2. Кнопка сохранения в словарь
3. Ссылка на TextStack для просмотра слова в контексте

**Публикация**: Chrome Web Store — $5 разовый платёж.

---

## Фаза 4: Мобильное приложение до релиза (4-6 недель)

> Цель: довести мобильное приложение (Expo/React Native) до состояния релиза в App Store и Google Play.

### 4.1 Текущий статус мобильного приложения

**Уже есть**: 29 экранов, Expo Router, API клиент, контексты (Auth, Download, Language, NativeLanguage, Theme), хуки (useCardAnswer, useHaptics, useQuickStats, useReaderSettings, useReadingSession, useTts, useVocabularyReview), 16 E2E тестов.

**Нужно доделать** (из apps/mobile/TODO.md):
- Auth flow (не работает на симуляторе)
- Infinite scroll (визуальная полировка)
- Reader menu icons (тач-таргеты 44x44)
- Dark mode (тестирование на всех экранах)
- Skeleton loaders (stats, vocabulary)
- Empty states (иллюстрации)

### 4.2 Критические фичи для релиза

**Auth**: Починить Google Sign-In и Apple Sign-In в мобильном (priority #1).

**Push notifications**:
- Стрик-напоминания: "Не забудь почитать сегодня! Стрик: 5 дней"
- Новые книги: "Добавлена книга: Animal Farm"
- SRS review ready: "15 слов ждут повторения"
- Бэкенд: `expo-notifications` + push token storage
- Создать: `backend/src/Api/Endpoints/PushNotificationEndpoints.cs`
- Создать: `backend/src/Application/Notifications/PushNotificationService.cs`
- Создать: `backend/src/Domain/Entities/UserPushToken.cs`

**Sync web <-> mobile**:
- Уже есть через API — reading progress, vocabulary, bookmarks
- Нужно проверить: конфликт резолюция при оффлайн-записи с двух устройств
- Добавить: `lastSyncedAt` timestamp на клиенте для delta sync

**Widget "Continue Reading"**: iOS/Android виджет с текущей книгой и прогрессом.

### 4.3 Подготовка к Store

**App Store**:
- Screenshots: 6.7" (iPhone 15 Pro Max), 6.1" (iPhone 15), iPad Pro
- App Preview video (15-30 сек)
- Description: ключевые слова "learn english reading", "book reader translator"
- Privacy labels (Data Collection)

**Google Play**:
- Feature graphic (1024x500)
- Screenshots: phone + tablet
- Short description (80 chars), full description (4000 chars)
- Content rating questionnaire

**Файлы для обновления**:
- `apps/mobile/app.json` — version, bundleIdentifier
- `apps/mobile/eas.json` — production profile
- Store assets в `apps/mobile/assets/store/`

---

## Фаза 5: Монетизация (1-2 недели, после запуска mobile)

> Цель: перейти с free на freemium $4.99/мес, сохранив бесплатный доступ к базовым фичам.

### 5.1 Модель Free vs Premium ($4.99/мес)

| Фича | Free | Premium $4.99/мес |
|---|---|---|
| Чтение книг из каталога | Без ограничений | Без ограничений |
| Перевод по тапу | 50 слов/день | Без ограничений |
| SRS-карточки | 10 слов в словаре | Без ограничений |
| Загрузка своих книг | 1 книга | 20 книг |
| TTS | 30 мин/день | Без ограничений |
| Offline скачивание | 1 книга | 10 книг |
| Word Highlighting TTS | Нет | Да |
| Chrome Extension sync | Нет | Да |
| Продвинутая статистика | Базовая | Полная |
| Sleep timer | Нет | Да |
| Голос TTS выбор | 5 голосов | 200+ |
| Push напоминания стриков | Нет | Да |

### 5.2 Бэкенд-реализация

**Новая сущность**: `Subscription` (UserId, Plan, StartDate, EndDate, Status, Provider)

**Middleware**: `SubscriptionMiddleware` — проверяет лимиты на запросах к ограниченным endpoints.

**Платёжные провайдеры**:
- iOS: RevenueCat (обёртка над StoreKit)
- Android: RevenueCat (обёртка над Google Play Billing)
- Web: Stripe Checkout (для будущего web-плана)

**Файлы**:
- Создать: `backend/src/Domain/Entities/Subscription.cs`
- Создать: `backend/src/Application/Subscriptions/SubscriptionService.cs`
- Создать: `backend/src/Api/Endpoints/SubscriptionEndpoints.cs`
- Создать: `backend/src/Api/Middleware/SubscriptionMiddleware.cs`
- Миграция: `AddSubscription`

### 5.3 Pricing Page

**Что делаем**: Страница `/pricing` с toggle Annual/Monthly, 2 плана.

**Как у ElevenReader**: Чистый дизайн, toggle годовой/месячной оплаты, сравнительная таблица фич.

**Цены**:
- Monthly: $4.99/мес
- Annual: $3.33/мес ($39.99/год, save 33%)

**Файлы**:
- Создать: `apps/web/src/pages/PricingPage.tsx`
- Создать: `apps/web/src/components/pricing/PlanCard.tsx`
- Создать: `apps/web/src/components/pricing/FeatureComparisonTable.tsx`
- Обновить роутер и навигацию

---

## Фаза 6: Реферальная программа и growth (2 недели)

### 6.1 Реферальная программа

**Механика**: Пригласи друга → оба получают 7 дней Premium бесплатно.

**Бэкенд**:
- `UserReferral` entity (ReferrerUserId, ReferredUserId, Code, RewardGranted)
- Уникальный код: `textstack.app/ref/{code}`
- При регистрации по реферальной ссылке — обоим выдаётся 7 дней premium

**Файлы**:
- Создать: `backend/src/Domain/Entities/UserReferral.cs`
- Создать: `backend/src/Application/Referrals/ReferralService.cs`
- Создать: `backend/src/Api/Endpoints/ReferralEndpoints.cs`
- Создать: `apps/web/src/pages/ReferralPage.tsx`

### 6.2 Email-цепочка онбординга

**Что делаем**: 5 автоматических email'ов после регистрации.

- День 0: Добро пожаловать, как начать читать
- День 1: Как работает перевод по тапу
- День 3: Попробуй SRS-карточки
- День 7: Загрузи свою книгу
- День 14: Поделись с другом (реферальная ссылка)

**Реализация**: Resend (уже используется) + Worker scheduled job.

---

## Фаза 7: "Умные" фичи (ongoing)

### 7.1 Smart File Imports

**Что делаем**: Автоматически пропускать headers, footers, оглавление, номера страниц при импорте PDF.

**Где**: `backend/src/Extraction/TextStack.Extraction/Extractors/PdfTextExtractor.cs`

**Как**: Анализ повторяющихся блоков текста (header/footer) на каждой странице → исключение.

### 7.2 AI-саммари книг

**Что делаем**: LLM генерирует краткое описание каждой главы (уже есть Ollama).

**Зачем**: Помогает ученикам выбрать книгу по уровню и интересу.

### 7.3 Уровень сложности текста

**Что делаем**: Автоматическая оценка CEFR-уровня книги (A1-C2) по word frequency analysis.

**Бэкенд**: `Application/Books/ReadabilityAnalyzer.cs` — Flesch-Kincaid + word frequency vs CEFR word lists.

---

## Порядок реализации (Timeline)

```
Неделя 1-2:   Фаза 1 (Лендинг) — параллельно с Фазой 4.1
Неделя 2-4:   Фаза 2 (Фичи ридера) — Word Highlighting, Import URL
Неделя 3-5:   Фаза 4 (Mobile) — Auth fix, Polish, Push
Неделя 5-7:   Фаза 3 (Chrome Extension MVP)
Неделя 7-8:   Фаза 4.3 (Store submission)
Неделя 8-9:   Фаза 5 (Монетизация $4.99)
Неделя 9-10:  Фаза 6 (Referral, Onboarding emails)
Неделя 10+:   Фаза 7 (Smart features, ongoing)
```

**Параллельно всё время**: SEO, blog-контент, social media, user feedback.

---

## Технические решения

### Новые NuGet-пакеты

- `SmartReader` — для извлечения статей по URL (Фаза 2.2)
- `RevenueCat.Server` — для верификации подписок (Фаза 5)

### Новые npm-пакеты

- Chrome Extension: отдельный пакет, Vite build
- `react-native-purchases` (RevenueCat) — для мобильных подписок

### Новые Docker-сервисы

Не нужны — всё на существующей инфраструктуре.

### Миграции БД

1. `AddSiteStats` — materialized view для публичных метрик
2. `AddSubscription` — таблица подписок
3. `AddUserReferral` — таблица рефералов
4. `AddUserPushToken` — push notification tokens
5. `AddArticleImport` — tracking imported URLs

### Новые файлы (summary)

```
apps/
├── web/src/components/home/
│   ├── TestimonialsSection.tsx      # Фаза 1.1
│   ├── FaqSection.tsx               # Фаза 1.2
│   └── ComparisonSection.tsx        # Фаза 1.3
├── web/src/components/reader/
│   └── VoiceSelector.tsx            # Фаза 2.3
├── web/src/components/library/
│   └── ImportUrlModal.tsx           # Фаза 2.2
├── web/src/components/pricing/
│   ├── PlanCard.tsx                 # Фаза 5.3
│   └── FeatureComparisonTable.tsx   # Фаза 5.3
├── web/src/pages/
│   ├── PricingPage.tsx              # Фаза 5.3
│   └── ReferralPage.tsx             # Фаза 6.1
├── web/src/data/
│   ├── testimonials.ts              # Фаза 1.1
│   ├── faq.ts                       # Фаза 1.2
│   └── voiceProfiles.ts            # Фаза 2.3
├── chrome-extension/                # Фаза 3 (весь пакет)
│   ├── manifest.json
│   ├── content-script.ts
│   ├── background.ts
│   ├── popup/
│   └── vite.config.ts
backend/src/
├── Api/Endpoints/
│   ├── SiteStatsEndpoints.cs        # Фаза 1.5
│   ├── TtsStreamEndpoints.cs        # Фаза 2.1
│   ├── SubscriptionEndpoints.cs     # Фаза 5.2
│   ├── PushNotificationEndpoints.cs # Фаза 4.2
│   └── ReferralEndpoints.cs         # Фаза 6.1
├── Api/Middleware/
│   └── SubscriptionMiddleware.cs    # Фаза 5.2
├── Application/
│   ├── UserBooks/ArticleImportService.cs  # Фаза 2.2
│   ├── Subscriptions/SubscriptionService.cs # Фаза 5.2
│   ├── Referrals/ReferralService.cs       # Фаза 6.1
│   ├── Notifications/PushNotificationService.cs # Фаза 4.2
│   └── Books/ReadabilityAnalyzer.cs       # Фаза 7.3
├── Domain/Entities/
│   ├── Subscription.cs              # Фаза 5.2
│   ├── UserReferral.cs              # Фаза 6.1
│   └── UserPushToken.cs             # Фаза 4.2
└── Tts/TextStack.Tts/
    └── EdgeTtsClient.cs             # Изменить: WordBoundary parsing (Фаза 2.1)
```

---

## Метрики успеха

| Метрика | Сейчас | Через 3 мес | Через 6 мес |
|---|---|---|---|
| MAU (web) | ? | 2x | 5x |
| Mobile downloads | 0 | 500 | 2000 |
| Paying users | 0 | 50 | 200 |
| MRR | $0 | $250 | $1000 |
| Chrome Extension users | 0 | 200 | 1000 |
| Avg. session duration | ? | +20% | +40% |
| SRS words saved/user | ? | +30% | +50% |
