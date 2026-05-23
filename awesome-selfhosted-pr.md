# PR to awesome-selfhosted (main, FOSS-only)

Now eligible since you switched to AGPL-3.0 (OSI-approved).

---

## ⚠️ ВАЖНО: блокер на 4 месяца

awesome-selfhosted имеет жёсткое правило в CONTRIBUTING:

> "Any software project you are adding was first released more than 4 months ago."

У тебя сейчас **нет ни одного tagged release** (GitHub показывает "No releases published"). Если запушить PR прямо сейчас — мейнтейнеры закроют его автоматическим canned reply:

> "Currently, this project has a release, but it is not yet 4 months old. Once the first release is four months old, feel free to resubmit."

**Что делать прямо сейчас:**

1. Создай release tag **сегодня**, чтобы запустить 4-месячный таймер:

   ```bash
   cd /Users/vasylvdovychenko/projects/textstack/textstack
   git tag -a v0.1.0 -m "Initial public release under AGPL-3.0

   First tagged release. Project entered AGPL-3.0 with PR #201.
   See CHANGELOG.md for details."
   git push origin v0.1.0
   ```

2. На GitHub → Releases → "Draft a new release" → выбрать тег `v0.1.0` → опубликовать с release notes.

3. Дата подачи в awesome-selfhosted: примерно **2026-09-04** (4 месяца от сегодня).

В промежутке — подавайся в другие awesome-лист (см. секцию ниже), они принимают сразу.

---

## Куда подавать (когда наступит время)

**Главная важность**: PR идёт в **`awesome-selfhosted/awesome-selfhosted-data`**, НЕ в основной репо `awesome-selfhosted/awesome-selfhosted`. Основной автоматически генерируется из data-репо.

URL для PR: https://github.com/awesome-selfhosted/awesome-selfhosted-data

---

## Формат — YAML, не markdown

Тебе нужно создать новый файл `software/textstack.yml` в data-репо. Содержание:

```yaml
# software name
name: "TextStack"

# URL of the software project's homepage
website_url: "https://textstack.app"

# URL where the full source code of the program can be downloaded
source_code_url: "https://github.com/mrviduus/textstack"

# description, shorter than 250 characters, sentence case
description: "Reader for technical books with LLM-powered context-aware term explanations and a capped weekly spaced repetition queue (alternative to Kindle Word Wise, LingQ)."

# license identifiers — see licenses.yml in the data repo for the full list
licenses:
  - AGPL-3.0

# languages/platforms — see platforms/ directory in data repo for the full list
platforms:
  - C#
  - Nodejs
  - Docker

# tags (categories) — see tags/ directory in data repo for full list
# IMPORTANT: pick the most fitting tag — in single-page mode software appears under the FIRST tag
# Likely candidates: "Note-taking & Editors" — verify exact name in tags/ directory before submitting
tags:
  - Note-taking and Editors

# software depends on a third-party service outside user's control
# TRUE because OpenAI API is required for the explanations feature
depends_3rdparty: true

# link to an interactive demo
demo_url: "https://textstack.app"
```

### Что проверить в YAML перед submit

1. **Tag name** — открой https://github.com/awesome-selfhosted/awesome-selfhosted-data/tree/master/tags и найди подходящий. "Note-taking and Editors" — моё лучшее предположение, но проверь точное имя файла. Если есть тег `Books` или `Reading` — он лучше.

2. **License identifier** — `AGPL-3.0` должно быть в `licenses.yml`. Проверь по https://github.com/awesome-selfhosted/awesome-selfhosted-data/blob/master/licenses.yml

3. **Platform names** — `C#`, `Nodejs`, `Docker` должны существовать в `platforms/` directory. Если у `C#` другое имя в их системе (например, `CSharp` или `dotnet`) — поменяй.

4. **Description**:
   - ✅ Под 250 символов (твоя ~190)
   - ✅ Sentence case (заглавная только в начале)
   - ✅ НЕ упоминает "open-source", "free", "self-hosted" — это implicit
   - ✅ "Alternative to X, Y" в конце — есть

---

## Что НЕ qualify (проверочный чеклист)

awesome-selfhosted отказывает если:
- ❌ Software depends on a specific cloud provider — OK, ты на любом VPS работаешь
- ❌ Desktop/mobile/CLI app требующий отдельный server — OK, ты server-side
- ❌ Library/SDK requiring app code — OK, ты end-user app
- ❌ PaaS/platform — OK
- ❌ Generic container/deployment tool — OK
- ❌ Dockerization existing app — OK, original work

TextStack проходит все критерии.

---

## Шаги для PR (когда минут 4 месяца)

1. Зайди на https://github.com/awesome-selfhosted/awesome-selfhosted-data
2. Открой папку `software/`
3. Кликни "Add file" → "Create new file"
4. Имя файла: `textstack.yml` (kebab-case)
5. Вставь YAML выше (с проверенными tag/license/platform именами)
6. Снизу: "Commit changes" → "Create a new branch for this commit and start a pull request"
7. PR title: `add TextStack`
8. PR body — минимально:

   ```
   Adding TextStack — a self-hosted reader for technical books that gives
   LLM-powered context-aware explanations of unknown terms.

   - Demo: https://textstack.app
   - Source: https://github.com/mrviduus/textstack
   - License: AGPL-3.0
   - First release: v0.1.0 (released YYYY-MM-DD, more than 4 months ago)
   - Documentation: https://github.com/mrviduus/textstack#readme

   Checklist:
   - [x] Submit one item per issue
   - [x] Searched existing issues and PRs
   - [x] Not already listed in awesome-sysadmin or related
   - [x] Actively maintained (commits in last week)
   - [x] First release more than 4 months ago
   - [x] Working installation instructions in README
   ```

9. Submit и жди ~2-4 недели на review.

---

## Что делать в эти 4 месяца — параллельные awesome-lists

Эти не имеют 4-месячного правила, можно подавать сразу:

### 1. awesome-readinglists / awesome-books
Поиск на GitHub: `topic:awesome topic:books`. Часто community-maintained, формат — обычный markdown.

### 2. awesome-dotnet-applications
- URL: https://github.com/quozd/awesome-dotnet#applications (или https://github.com/oneapptiger/awesome-dotnet-core)
- Формат markdown, без 4-месячного правила
- Категория: end-user applications written in .NET
- TextStack quality: AGPL + active development = подойдёт

### 3. awesome-llm-apps
- URL: https://github.com/Shubhamsaboo/awesome-llm-apps
- Категория: LLM applications in production
- TextStack использует OpenAI для explanations — fits

### 4. awesome-dotnet (общий)
- URL: https://github.com/quozd/awesome-dotnet
- Формат markdown, секция "Applications"

### 5. awesome-react-native (показать мобильное приложение)
- URL: https://github.com/jondot/awesome-react-native
- Секция: Apps and Examples

### 6. awesome-aspnet-core
- URL: https://github.com/Kahbazi/awesome-aspnetcore-mvc
- Секция: Applications

---

## Стратегия по времени

**Сейчас (сегодня)**:
- Сделать release tag `v0.1.0` → стартует 4-месячный таймер для awesome-selfhosted
- Подать PR в awesome-llm-apps → быстрый принимающий список, AGPL ок

**Через неделю**:
- Подать PR в awesome-dotnet (Applications секция)

**Через 2 недели**:
- Подать PR в awesome-react-native (apps секция)

**2026-09-04 (через 4 месяца)**:
- Подать YAML в awesome-selfhosted-data (главный приз)

К сентябрю у тебя будет 3-4 backlinks с awesome-листов и main awesome-selfhosted на подходе.
