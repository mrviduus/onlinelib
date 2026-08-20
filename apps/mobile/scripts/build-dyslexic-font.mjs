#!/usr/bin/env node
// Regenerates src/lib/openDyslexicBase64.ts from the woff2 the web app serves, so
// the two platforms cannot ship different fonts — or, as happened here, the same
// broken one twice.
//
//   npm run build:dyslexic-font
//
// The mobile reader is a WebView with no network guarantee, so the font is inlined
// as a data: URI rather than loaded from a URL. ~154 KB of base64 for ~115 KB of
// font.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MOBILE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = resolve(MOBILE_ROOT, '../web/public/fonts/OpenDyslexic-Regular.woff2')
const OUT = resolve(MOBILE_ROOT, 'src/lib/openDyslexicBase64.ts')

const font = readFileSync(SOURCE)

// The bug this script exists to prevent: the previous "font" was a GitHub HTML page
// saved with a .woff2 extension. Nothing checked, so the @font-face silently failed
// on both platforms for months. A real woff2 starts with "wOF2".
const magic = font.subarray(0, 4).toString('ascii')
if (magic !== 'wOF2') {
  console.error(`✗ ${SOURCE}`)
  console.error(`  is not a woff2 — first four bytes are ${JSON.stringify(magic)}, expected "wOF2".`)
  console.error('  Download a real OpenDyslexic build (SIL OFL 1.1) before regenerating.')
  process.exit(1)
}

const header = `// OpenDyslexic Regular, inlined as base64 so the WebView reader can render it offline.
//
// Generated — do not hand-edit. Regenerate with:
//   npm run build:dyslexic-font
//
// History worth keeping: this file used to hold 396 KB of base64 that decoded to a
// GitHub HTML page rather than a font — a curl of a GitHub URL saved verbatim. The
// @font-face therefore always failed and the "Dyslexic" reader setting silently fell
// back to sans-serif. The same broken bytes were also sitting in
// apps/web/public/fonts/OpenDyslexic-Regular.woff2, so neither platform ever shipped
// the feature. Both are real now; a real woff2 starts with the magic "wOF2".
//
// Font: OpenDyslexic by Abbie Gonzalez. SIL Open Font License 1.1.
// Licence text: apps/web/public/fonts/OpenDyslexic-LICENSE.txt
`

writeFileSync(OUT, `${header}\nexport const openDyslexicBase64 = '${font.toString('base64')}'\n`)
console.log(`✓ ${OUT}`)
console.log(`  ${font.length} bytes of woff2 → ${Math.round(font.length * 4 / 3 / 1024)} KB of base64`)
