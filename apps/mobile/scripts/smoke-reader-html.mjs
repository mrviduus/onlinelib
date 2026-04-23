#!/usr/bin/env node
// Smoke test: the injected overlay script is syntactically valid, and
// readerHtml.ts interpolates it correctly when overlayV2=true. Parses the
// extracted JS via vm.Script — catches unescaped `${…}`, broken template
// boundaries, missing semicolons across slice-8b surface.
//
// Runs via: node apps/mobile/scripts/smoke-reader-html.mjs
// Exits non-zero on any parse error.

import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function readSource(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
}

function extractTemplate(source, markerConst) {
  const i = source.indexOf(`export const ${markerConst} = \``)
  if (i === -1) throw new Error(`marker ${markerConst} not found`)
  const start = source.indexOf('`', i)
  const end = source.indexOf('`', start + 1)
  if (end === -1) throw new Error(`template close backtick not found for ${markerConst}`)
  return source.slice(start + 1, end)
}

function parseOrDie(label, code) {
  try {
    new vm.Script(code)
  } catch (e) {
    console.error(`[FAIL] ${label} — ${e.message}`)
    const lines = code.split('\n')
    const m = /:(\d+)$/.exec(e.stack || '')
    if (m) {
      const ln = Number(m[1])
      console.error(lines.slice(Math.max(0, ln - 3), ln + 2).join('\n'))
    }
    process.exit(1)
  }
}

// 1. Overlay script parses standalone.
const overlayScript = extractTemplate(readSource('src/lib/readerOverlayScript.ts'), 'READER_OVERLAY_SCRIPT')
parseOrDie('READER_OVERLAY_SCRIPT', overlayScript)
console.log(`ok overlay-script — ${overlayScript.length} bytes`)

// 2. readerHtml.ts interpolates it under the expected flag gate.
const readerHtml = readSource('src/lib/readerHtml.ts')
const hasImport = /from '\.\/readerOverlayScript'/.test(readerHtml)
const hasFlagSetter = /__textstackOverlayV2Mobile/.test(readerHtml)
const hasDispatcher = /hlOverlayEnabled|hlPaintRangeOverlay/.test(readerHtml)
if (!hasImport) { console.error('[FAIL] readerHtml.ts does not import READER_OVERLAY_SCRIPT'); process.exit(1) }
if (!hasFlagSetter) { console.error('[FAIL] readerHtml.ts has no __textstackOverlayV2Mobile flag setter'); process.exit(1) }
if (!hasDispatcher) { console.error('[FAIL] readerHtml.ts has no overlay dispatcher'); process.exit(1) }
console.log('ok readerHtml wiring — import + flag + dispatcher present')

// Note: deeper parsing of readerHtml's embedded <script> bodies from source
// is unreliable — template literal escapes (e.g. `\\p{L}` → `\p{L}`) don't
// round-trip through a regex strip. TypeScript already validates the string
// literal; runtime syntax of the injected JS is verified device-side.

console.log('all ok')
