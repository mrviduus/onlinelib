# SEO Roadmap → 50K Google clicks/month

Стартовая точка (2026-05-14): 15 кликов/месяц. Цель: 50,000 кликов/месяц.
Множитель ~3,300×. Реалистичный таймлайн: 18-24 месяца при последовательном исполнении.

Связанный документ: [audit-2026-05-14.md](./audit-2026-05-14.md).

## Принципы

1. **Контент = главный драйвер**, не беклинки. Беклинки усиливают то что уже хорошо ранжируется; они не вытащат тонкие страницы.
2. **Метадата only** — chapter pages остаются noindex (избегаем duplicate с Gutenberg).
3. **Long-tail прежде head terms** — `james joyce books` имеет тысячу конкурентов; `themes in joyce dubliners` имеет десятки.
4. **Hub pages > много отдельных страниц** — одна хорошая hub-страница ранжируется лучше чем 50 тонких author pages.
5. **Track impressions раньше чем clicks** — impressions это leading indicator, растёт за 2-3 мес до того как клики прорастут.
6. **Не покупать беклинки никогда** — в нише free books Penguin особенно агрессивен.

## Траектория

| Месяц | Indexed pages | Impressions/mo | Clicks/mo |
|-------|---------------|----------------|-----------|
| Now (2026-05) | 327 | ~360 | ~15 |
| +3 (2026-08) | 800 | 2K | 100 |
| +6 (2026-11) | 1,500 | 8K | 500 |
| +12 (2027-05) | 2,500 | 50K | 3,500 |
| +18 (2027-11) | 3,500 | 200K | 15,000 |
| +24 (2028-05) | 4,500 | 500K | 50,000 |

Это **optimistic если исполнять последовательно**. Если выпадет 2-3 месяца — добавить +6 мес к каждой вехе.

---

## Phase 0 — Текущие реальные блокеры (Now → +2 weeks)

Технический фундамент в порядке: sitemap — корректный index с 4 sub-sitemaps (books/authors/genres/pages), 391 URLs всего, 84% indexed coverage. Health Score 87/100. Большинство Ahrefs/GSC ошибок — легаси-долг от старых поломок SEO (~3 мес назад), краулеры переваривают бэклог. Это выгорит само.

Реально стоит сделать:

- [x] ~~Разобраться с 23 April anomaly~~ — RESOLVED: каталог с ботами был удалён, метрики нормализовались.
- [x] ~~Sitemap coverage~~ — sitemap уже корректный index с 4 sub-sitemaps. Не требует фикса.
- [ ] **85 Soft 404 → заполнить или 410** — Google прямо сейчас считает эти страницы пустыми. Экспортнуть из GSC, классифицировать: (a) тонкая authors/genres → SEO backfill; (b) объективно удалённые → 410 Gone. Быстрый win, добавит ~50+ страниц в индекс.
- [ ] **GA4 engagement events** — добавить scroll и engagement события чтобы avg engagement time стал достоверным. Сейчас 11s искажает business reporting (не SEO напрямую).

**Что НЕ делаем (легаси-долг, выгорит сам):**
- ~~SlugHistory + 301 для роста 404s~~ — Ahrefs "new" = переваривание бэклога, не свежие поломки.
- ~~65 duplicate canonical mismatch~~ — скорее всего старые URLs из периода поломок.
- ~~171 pages with broken internal links~~ — те же legacy URLs.
- ~~`?direct=1` canonical audit~~ — старые URLs, новые ссылки уже корректны.

После Phase 0 главный рычаг это **Phase 1 (content scale)** — увеличить индексируемую поверхность с 391 до 3000-5000 страниц через publication + hub pages. Это и есть реальная работа на пути к 50K clicks/mo.

## Phase 1 — Content base (Month 1-3)

Цель: 800 indexed pages, ~100 clicks/mo. Это про объём + качество существующих метадата-страниц.

- [ ] **Auto-publish 500+ books** через существующий pipeline. Приоритет:
  - Public domain классика которая широко искомая (Project Gutenberg top 100)
  - Books релевантные для dev/AI engineer аудитории
  - Short classics (легко завершить, хорошие session metrics)
- [ ] **SEO backfill quality pass** на ВСЕ existing editions:
  - Description (200+ слов, unique angle, не generic)
  - Relevance (почему стоит читать сейчас)
  - Themes (3-5 темы с расшифровкой)
  - FAQs (5 вопросов с ответами 50+ слов каждый)
  - SeoTitle + SeoDescription (60/160 chars, intent-matched)
- [ ] **Authors pages** — для всех authors с editions:
  - Bio 300+ слов
  - Список всех editions с teaser descriptions
  - "Related authors" блок (3-5 ссылок)
  - Schema.org Person + sameAs (Wikipedia, Wikidata)
- [ ] **Genres pages** — все genres:
  - Description 300+ слов о жанре
  - Top editions с teaser
  - Related genres
  - Sub-themes если есть
- [ ] **Internal linking pass** — каждый edition page должен иметь:
  - Author link
  - Genre link
  - 3 "Related editions" (same author OR same genre OR same theme)
  - Breadcrumb (уже есть, проверить)
- [ ] **Fix 171 pages with broken internal links** — найти source pages, удалить или обновить ссылки.

## Phase 2 — Hub pages для информационного intent (Month 3-6)

Цель: 1,500 indexed pages, ~500 clicks/mo. Это про новый тип трафика — информационный, не транзакционный.

Hub pages сами ранжируются на long-tail и линкуют на book pages. Это даёт двойной эффект: hub получает clicks, book pages получают internal links.

**Кандидаты на hub pages под dev/AI engineer аудиторию:**

- [ ] Books every software engineer should read (curated 20-30)
- [ ] Classic novels about AI, ethics, and technology (10-15)
- [ ] Short classics you can finish in a weekend (15-20)
- [ ] Free books for English language learners (graded by level)
- [ ] Russian classics in English translation (15-20)
- [ ] Best free public domain SF and fantasy (20-30)
- [ ] Books about systems thinking and complexity (10-15)
- [ ] Classic philosophy free to read online (15-20)
- [ ] Free books about war and humanity (10-15)
- [ ] Books that shaped modern thought (curated essays)

Каждая hub page = 800-1200 слов оригинального контента + список книг с teaser + internal links на каждую. Это контент типа "best of" listicle который Google и любит, и который часто получает беклинки естественно.

**Технически**: либо как часть React app (`/en/lists/{slug}`), либо как admin-managed entity новой entity `Collection` с editions M2M. ADR нужен.

## Phase 3 — Authority и беклинки (Month 6-12)

Цель: 2,500 indexed pages, ~3,500 clicks/mo. Это про чтобы поднять existing pages на странице 1-2 Google.

К этому моменту контент-машина работает; теперь добавляем authority signals.

**Outreach каналы (ranked by ROI):**

- [ ] **Hacker News пост** про техническую сторону TextStack (SSG, vocabulary SRS, Edge TTS WebSocket, extraction pipeline). Аудитория HN читает такое; даёт dofollow ссылку + долгий referral хвост.
- [ ] **Show HN запуск** — отдельно, когда будут метрики и история.
- [ ] **HARO / Qwoted / Help A B2B Writer** — отвечать на запросы по темам чтения, образования, language learning, productivity. Получать цитаты в крупных изданиях. ~1 hour/неделю, 2-3 backlink/мес ожидаемо.
- [ ] **Dev.to + Hashnode posts** — длинные технические статьи про building TextStack. Каждый пост = link to textstack.app. 5-10 постов даст 5-10 dofollow.
- [ ] **Reddit organic** — r/books, r/printSF, r/learnprogramming, r/languagelearning. Не self-promo, а полезные комменты с упоминанием когда уместно. 1-2 hour/неделю.
- [ ] **Product Hunt запуск** — когда будут полные feature set и story. Один-два дня большого трафика + долгий PH-backlink.
- [ ] **Guest posts на dev-блогах** — про deep reading, vocabulary, language learning. С естественной ссылкой на TextStack.
- [ ] **Listicles от себя** — "Best free reading apps for developers 2026" на vasyl.blog и Dev.to. Цитируют и линкуют другие блоги.

**Чего НЕ делать:**
- Покупать беклинки (Penguin penalty)
- Mass outreach с шаблонами (не работает)
- PBNs (Private Blog Networks)
- Comment spam

## Phase 4 — Scale (Month 12-24)

Цель: 4,500 indexed pages, 50K clicks/mo.

К этому моменту первые 3 фазы должны давать стабильный organic growth. Это фаза масштабирования того что работает.

- [ ] **Chapter-by-chapter summaries** — UNIQUE контент для классики, которой мало в хорошем виде. Один edition = book overview + chapter summaries (каждый ~500 слов с критическим анализом). Это даёт unique value vs Goodreads/SparkNotes и оправдывает снятие noindex для chapter summary pages (но НЕ для самого текста).
- [ ] **Study guides** — для книг которые часто читают в школах/universities. Themes, characters, motifs, key quotes (короткие).
- [ ] **Multi-language** — добавить ru, uk если есть ресурс. Каждый язык = новая поверхность с минимумом конкурентов в нашей нише.
- [ ] **Audio TTS landing pages** — `Listen to {Book Title} in English (free)` — отдельный intent, мало конкурентов.
- [ ] **Vocabulary by book pages** — `Words from {Book Title}` — поверхность которой никто не покрывает.

## Метрики и cadence

**Еженедельно** (10 мин):
- GSC: total clicks, impressions, indexed pages count, "Crawled-not-indexed" count, average position
- Ahrefs: Health Score, Errors count (особенно 404s), Referring domains delta
- GA4: Organic Search sessions, engagement rate, top landing pages

**Раз в 2 недели** (30 мин):
- Top 20 queries в GSC — есть ли движение position?
- Pages со средней позицией 11-20 — кандидаты на content refresh (добавить депости, internal links)
- CTR < 2% на impressions > 50 — переписывать title/description

**Раз в месяц** (1-2 часа):
- Аудит auto-publish quality (sample 10 newly published, проверить descriptions/themes)
- Hub pages performance — какие ранжируются, какие не работают
- Backlinks audit — что появилось, какие из них качественные

**Quarterly** (полдня):
- Полный Ahrefs audit re-run
- GSC review всех "Crawled-not-indexed" и Soft 404
- Competitor analysis (Goodreads, Standard Ebooks, OpenLibrary, Z-library) — что у них ранжируется по target queries
- Strategy review: что работает быстрее ожиданий, что отстаёт

## Социальные сети — отдельно

Соцсети **не влияют на rankings напрямую**, но дают brand search (Google это засчитывает) и прямой трафик.

- **Twitter** (@Rexetdeus): build in public, weekly metrics threads, feature launches, технические треды. Это работает для dev-аудитории. Уже идёт через `docs/marketing/x-routine/`.
- **Dev.to / Hashnode**: длинные технические статьи. Покрывается в Phase 3.
- **YouTube**: demos vocabulary SRS, reader UX, технические разборы. Низкий приоритет — нужно время на production. Откладываем до Phase 4.
- **BookTok / Bookstagram**: другая аудитория, другой контент-стиль. **Не делать** в обозримой перспективе — распыление ресурсов.

## Что не делать

- Не клепать AI-generated thin content без редактуры — Helpful Content Update убьёт.
- Не таргетировать коммерческие фразы (`buy ebook`) — intent не совпадает с бесплатной библиотекой.
- Не пытаться ранжироваться head terms (`free books`) — у Gutenberg DR 88, мы не пройдём.
- Не делать doorway pages под каждый ключевик — Google ловит давно.
- Не оптимизировать chapter pages — они noindex, и это правильно.
- Не пытаться "побыстрее" — Google sandbox для нового домена и низкий authority это органически 12+ месяцев работы.
