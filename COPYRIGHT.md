# Copyright & third-party notices

TextStack is an assembly of original code and third-party components. Licenses
differ by layer. This file is a plain-English map — the authoritative text is
in each project's own LICENSE.

## TextStack source code

Everything under this repository authored by TextStack contributors is
licensed under the **Business Source License 1.1** (BUSL-1.1). See
`LICENSE` at repo root.

Copyright © 2026 Vasyl Vdovychenko and contributors.

**Summary (not legal advice, see LICENSE for authoritative text):**

- You may: read, fork, modify, redistribute, self-host for personal or
  internal use, run in development/CI.
- You may **not**: offer TextStack as a **Hosted Service** — i.e. a
  commercial product that lets third parties access TextStack
  functionality as a service — without a commercial license from the
  Licensor.
- **Change Date: 2030-04-22.** On that date the code auto-converts to
  Apache License 2.0 and all restrictions drop.

For a commercial / hosted-service license, contact the Licensor via the
contact form at https://textstack.app.

## Book content

TextStack ships with two distinct pipelines for books:

### 1. Standard Ebooks corpus (seeded catalog)

Books imported from [Standard Ebooks](https://standardebooks.org/) are
**Public Domain** in the US and most of the world, released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

- Source texts: public domain works (Dracula, Pride and Prejudice, etc.)
- Standard Ebooks' editorial improvements (typography, semantics): CC0
- Covers derived from CC0 / public domain artwork

Attribution is courtesy, not required. TextStack attributes Standard Ebooks
on every book detail page.

### 2. User-uploaded books

Files uploaded by users (`/me/books/upload`) are stored and processed **on
behalf of that user only**, under their own account, and not redistributed.

TextStack makes no license claim on user uploads. Each user is responsible
for having the right to upload the content they upload. See `/legal/terms`
(planned) and `/legal/dmca` (planned) for takedown process.

## Third-party services

### Microsoft Edge TTS

TTS audio is generated via Microsoft Edge's public TTS WebSocket endpoint
(`speech.platform.bing.com`).

- No API key, no SDK — implemented by direct protocol
- Usage subject to Microsoft's terms for the Edge browser
- Audio may **not** be redistributed as a standalone product
- For commercial redeployment, replace with Azure Speech Service or
  another licensed provider

Implementation: `backend/src/Tts/TextStack.Tts/`.

### LLM providers

- **OpenAI** — contextual word explanations + translation (`gpt-5-mini`).
  Requires `OPENAI_API_KEY`. Usage subject to OpenAI terms
- **Ollama** (optional, self-hosted) — SRS distractor + hint generation.
  Model `qwen3:8b`, Apache-2.0. Runs locally in Docker, no data leaves host

### Dictionary

Word definitions via [Free Dictionary API](https://dictionaryapi.dev/) —
free for personal/educational use.

## Third-party code dependencies

### Backend (.NET)

Major NuGet packages (full list: `dotnet list package`):

- ASP.NET Core — MIT
- Entity Framework Core — MIT
- Npgsql — PostgreSQL License (BSD-style)
- PuppeteerSharp — MIT
- VersOne.Epub — MIT
- PdfPig — Apache-2.0

### Frontend (web + admin + mobile)

Major npm packages (full list: `package.json`):

- React, React Router, Vite — MIT
- React Native, Expo — MIT
- Puppeteer (SSG) — Apache-2.0
- date-fns — MIT
- @tanstack/react-query — MIT

Run `npm audit` / `dotnet list package --vulnerable` before each release
to surface license or security issues.

## Trademarks

"TextStack" and `textstack.app` are unregistered marks of the project author.

"Kindle", "Word Wise" — Amazon.com, Inc.
"LingQ" — LingQ Inc.
Mentioned for comparison only; no affiliation or endorsement.

## Questions

Legal / licensing questions: open a GitHub Discussion or email via the
contact form at https://textstack.app.

DMCA-style takedown: see `/legal/dmca` (planned) or file a Discussion
tagged `legal`.
