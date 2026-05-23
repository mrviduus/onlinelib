# Indie Hackers — First Starting Up Post

**Status**: FINAL DRAFT v2 — optimized for max reach (sharp hook, scannable, concrete)
**Channel**: Starting Up section on indiehackers.com
**Goal**: первый пост от @textstack, founder story, drive engagement + visibility
**Tone**: honest, builder voice, no marketing, no fabricated numbers

---

## Pre-publish checklist

- [ ] Прочитать вслух — звучит как ты, не как маркетолог?
- [ ] Цифры верифицированы: 25 users / 9 returning / 32m 36s avg / 44 GSC clicks
- [ ] No fabricated данные (нет SRS retention %, нет "users upload 2-3 books")
- [ ] Опубликовать Tue/Wed/Thu 8-11am EST
- [ ] Готов первые 2 часа отвечать на комменты

---

## Title (final)

# I built software to read one book.

**Backup options** (если первый не нравится):
- I gave up on DDIA three times. So I built a reader to finish it.
- Six months of code to finish one technical book

**Recommendation**: первый — самый сильный hook на ленте IH. Curiosity-driven, ничего не требует знать заранее. В первых 2 строчках IH preview виден весь интригующий setup.

---

## Body (final, ~390 words)

I gave up on *Designing Data-Intensive Applications* three times.

The third time, I built software to finish it. Six months later, that software is TextStack — open source, AGPL-3.0, free at textstack.app.

---

**The friction**

The problem wasn't the math. It was vocabulary.

Page 256 of DDIA uses "phantom" as a database isolation anomaly. The dictionary tells me it's a ghost. Google tells me it's a Rolls-Royce model. Kindle's Word Wise — same.

Every chapter has 5-10 words like that. Each lookup breaks the thread. I gave up on chapter 7 three times.

---

**What I built**

A reader that knows what book it's reading.

Tap any word, get a 2-3 sentence explanation in the book's domain. "Phantom" in DDIA returns the database meaning, not the ghost.

The rest:

- Upload EPUB/PDF/FB2 — your own books
- Vocabulary SRS with 5 stages (Recognition → Recall → Context → Mastered)
- Edge TTS audio, no API key needed
- Translation via OpenAI, dictionary, full-text search

Stack: .NET 10 + PostgreSQL backend, React + React Native frontend. Self-host with `docker compose up`, or try at textstack.app without signup.

---

**Three weeks of clean data**

- **25 unique users.** 19 new, 9 returning.
- **32 minutes** average engagement time per user.
- **8.2 sessions** per active user.
- **44 Google clicks** in 3 months (broader trajectory).

Most of those 25 are people I told directly. The 9 organic strangers are scattered: US, Ireland, Pakistan, Colombia. Tiny audience, but the engagement says the ones who find it actually read.

The hard part: my audience — non-native English speakers reading technical books in English — is real but globally distributed. They're not concentrated in one subreddit or one country.

---

**Two questions**

1. If you've ever quit a technical book — what was the friction? Was it vocabulary like me, or something else I'm missing?

2. How did you find your first 100 real users when your audience isn't in one place? Open to anything that worked.

---

github.com/mrviduus/textstack — happy to dig into any technical decisions in the comments.

---

## Why this version works better than v1

| Element | v1 | v2 |
|---------|----|----|
| Opening | "I'm Vasyl. For the last six months..." (warmup) | "I gave up on DDIA three times." (hook) |
| Friction example | "5-10 terms with domain-specific meanings" (abstract) | "Page 256, 'phantom'..." (concrete) |
| Metrics format | Bulleted list mid-paragraph | Pull-quote block with bold numbers |
| Paragraph length | 4-6 lines (wall on mobile) | 1-3 lines (scannable) |
| Subheadings | None | "The friction" / "What I built" / "Three weeks of data" / "Two questions" |
| Closing | List of features + questions | One line + GitHub link |
| Word count | 430 | 390 |

The story arc is the same — failure → root cause → built solution → honest metrics → ask community. But every paragraph fights for the reader's next 5 seconds of attention.

---

## Длина и формат

~390 слов. Это оптимальная длина для IH Starting Up posts — короче 250 выглядит лениво, длиннее 600 не дочитывают.

Subheadings (bold, single phrase) разбивают пост на 4 ясных секции — каждую видно на screen view даже не скроллируя.

Pull-quote блок с метриками — самая важная часть для scanners. Кто пробегает глазами — видит цифры. Кто читает — видит контекст.

---

## Когда публиковать

- **Best**: Tuesday, Wednesday, Thursday 8-11am EST
- Для Eastern Canada (твой часовой пояс) это 8-11am локально
- **Avoid**: weekends (посты теряются), monday morning (founders ещё разбирают почту), late afternoon EST (поздний US, спящая Европа, Азия спит)
- **Avoid**: дни больших announcements (большие YC демо, Stripe Press launch и т.п.)

---

## Что делать первые 2 часа после публикации

1. Каждые 10-15 минут проверять комменты — отвечать substantive в течение 15-30 минут
2. На каждый комментарий отвечать с **вопросом обратно** ("What about X in your case?") — это удваивает депость threads
3. Не "Thanks for the comment!" — это спам и алгоритм это видит
4. Если кто-то критикует — спроси follow-up, не защищайся. "What would have made it work for you?" гасит конфликт.
5. Не упоминать в комментариях Twitter handle или другие projects — выглядит как self-promo carousel

## После 2-3 часов когда уже есть engagement

- Cross-post в Twitter с одной строкой: "Wrote about why I built TextStack on Indie Hackers — would love feedback" + link
- НЕ запрашивать апвоты — IH модерация banит за это
- НЕ постить в нескольких subreddit-ах с тем же текстом — выглядит как dropping

## Через 24-48 часов

- **Engagement хороший** (10+ comments, 20+ upvotes) — это валидация, через 3-4 недели можно повторно постить с другим angle (milestone post через месяц)
- **Тишина** — это тоже data. Возможно timing был плохой или title не зацепил. Не паника, не удалять. Через 4-6 недель попробовать снова с другим hook.

## Чего не делать после поста

- Не постить второй пост в IH в течение недели — выглядит как спам
- Не отвечать на критику оборонительно — "Actually if you read more carefully..." убивает goodwill
- Не давать промокоды/discount — продукт бесплатный, не надо
- Не упоминать "btw also check out my @..." в комментариях — плохая форма на IH
