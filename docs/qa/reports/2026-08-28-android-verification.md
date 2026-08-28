# Проверка девяти правок — Android, build 22 + OTA

**Дата:** 2026-08-28 · **Сборка:** versionCode 22 из Play Internal Testing, поверх неё OTA
(двойной перезапуск по инструкции разработчика) · **Бэкенд:** прод · **Устройство:** эмулятор
Pixel 7 Pro, API 37 · **Аккаунт:** `qa-android-20260827@textstack.app`.

Проверка правок по девяти дефектам из
[отчёта о непроверенных поверхностях](2026-08-27-android-untested-surfaces.md).

---

## Итог

**Все девять закрыты. Проверено на устройстве, каждое — тем же способом, каким находилось.**

Инструкция разработчика сработала как описана: OTA применилась со второго запуска,
`pm verify-app-links --re-verify` перевёл домен из `1024` в `verified`.

---

## Подготовка

```
adb shell pm get-app-links app.textstack.mobile   →  textstack.app: 1024
adb shell pm verify-app-links --re-verify app.textstack.mobile
adb shell pm get-app-links app.textstack.mobile   →  textstack.app: verified
```

Что OTA действительно применилась, видно по N-8: строка «Language» исчезла из Profile —
это чисто JS-правка, значит новый бандл активен.

Серверная часть на месте до всякой верификации:

```
curl https://textstack.app/.well-known/assetlinks.json
HTTP=200  type=application/json
{ "relation": ["delegate_permission/common.handle_all_urls"],
  "target": { "namespace": "android_app", "package_name": "app.textstack.mobile",
              "sha256_cert_fingerprints": ["4B:46:2F:65:…", …] } }
```

Отпечаток `4B:46:2F:65:…` совпадает с подписью установленной сборки из
`pm get-app-links` — то есть верификации было чем закрыться.

---

## Девять проверок

| ID | Что должно было стать | Что вижу |
|---|---|---|
| **N-6** | Smart session двигает карточку | `wicked`: `stage 0 → 1`, повтор перенесён на 29-е. `same`: `consecutiveCorrect 0 → 1`. Запись происходит **в конце сессии**, не по карточке |
| **N-7** | https-ссылка открывает приложение | `https://textstack.app/en/books/the-aeneid` → `app.textstack.mobile/.MainActivity`, страница книги. `reset-password?token=…` → экран «Reset Password». Оба вместо Chrome |
| **N-8** | Строки Language в Profile нет | Нет. «I know» (родной язык для перевода) остался и работает |
| **N-9** | Чипы цитат называют главу с номером маркера | `[1] Book I`, `[6] Book I`, `[7] Book I`, `[13] Book I`, `[14] Book I`, `[17] Book I` — вместо шести одинаковых «ch.0» |
| **N-10** | Либрариан и тутор обращаются к читателю | Тутор: «You have two overdue words right now… let's start with…». Либрариан: «I found several books related to Roman war. The best match… is…». Ни «the user», ни «the learner», ни «on-constraint» |
| **N-11** | Однословный хайлайт виден с окружающим текстом | «…f the weather, with the signs **in** heaven and earth that fore-bo…» — контекст курсивом, само слово прямым |
| **N-12** | «1 word added» | На экране сейчас 2 и 3, поэтому единственное число не наблюдаемо. В коде — общий `plural()` в `packages/shared/src/lib/plural.ts` с тестами, вместо хардкода `s` |
| **N-13** | На Achievements первое достижение без прокрутки | Вкладка начинается с «Achievements (2/19)» и карточки «First Steps». Карточка стрика осталась только на Overview |
| **N-14** | Экран называется Revisit | «Revisit Highlights», подзаголовок на экране Highlights — «Revisit highlights one at a time». Плюс осмысленное пустое состояние: «Nothing new to revisit — you've seen all of these today» |

---

## Замечания, не отменяющие ни одну правку

**N-6 — ответы уходят в SRS в конце сессии, а не по карточке.** После ответа на первую из двух
карточек сервер ещё показывал прежнее состояние; оба слова обновились одновременно после экрана
«Session complete». Что произойдёт, если выйти из сессии посередине, я не проверял —
стоит либо проверить, либо писать по карточке.

**N-14 — «today» на границе суток.** Хайлайты просмотрены 27-го в 14:47, экран открыт 28-го в
00:08, и текст говорит «you've seen all of these today». Похоже на 24-часовое окно, названное
«today». Если так и задумано, слово выбрано неудачно.

**N-11 — контекст обрезается по символу, а не по слову.** «…f the weather» и «fore-bo…» —
край режет слова пополам. Читается неаккуратно, хотя задачу «покажи вокруг» решает.

**Тутор говорит «You keep missing this word»** про карточку, которую пользователь не отвечал ни
разу (`wicked` создан минутой раньше, `consecutiveCorrect: 0`). Формулировка модели опережает
факты.

---

## Отложенное — подтверждаю, что записано

`docs/STATUS.md` содержит **«PDF highlights have no context and never will»** с объяснением
причины: reflow-якорь хранит ~30 символов с каждой стороны и потому получил контекст задним
числом, а PDF-rect-якорь несёт только `exact`. Захват окружающего текста в момент создания
PDF-хайлайта записан как открытое продолжение. Четвёртым отчётом как «не исправлено» не придёт.

Там же нашлись два признания, которых я не находил сам и которые стоит знать:

- **`selfAssessment` принимается и выбрасывается** — «Almost» отличается от «Knew» только
  булевым, который из него выводится. Я нажимал «Knew» и не смог бы отличить результат.
- **`t()` не принимает параметров**, поэтому переводимых множественных форм пока нет;
  `plural()` закрывает английский случай.
