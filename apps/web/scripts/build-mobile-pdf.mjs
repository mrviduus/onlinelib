#!/usr/bin/env node
// Bundles the vanilla-DOM PDF viewer controller (apps/web/scripts/pdfViewer/entry.ts)
// PLUS the pdf.js legacy worker into a single string constant written to
// apps/mobile/src/lib/pdfViewerScript.generated.ts.
//
// Two esbuild passes (ADR-012 S4b):
//   1. WORKER  — pdfjs-dist legacy worker → classic IIFE, inlined as a string so
//      the controller can spin it up from a Blob URL (real off-thread worker,
//      NOT the fake main-thread fallback) inside the RN WebView.
//   2. CONTROLLER — entry.ts (pdf.js main API + shared virtualization math).
//
// Run via `pnpm -C apps/web build:mobile-pdf`. Mirrors build-mobile-overlay.mjs.
//
// NOTE: legacy pdfjs + worker inlined as a string is HEAVY (~1.5-2 MB). It is
// only paid by user-book readers that open an Original-layout PDF — the string
// const is tree-kept out of every other screen's render.

import { build } from 'esbuild'
import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..', '..')
const require = createRequire(import.meta.url)

const controllerEntry = resolve(__dirname, 'pdfViewer/entry.ts')
// Resolve through node (pnpm) rather than a hard path — pdfjs lives under
// apps/web/node_modules/.pnpm, not the repo-root node_modules.
const workerEntry = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs')
const outFile = resolve(repoRoot, 'apps/mobile/src/lib/pdfViewerScript.generated.ts')

const common = {
  bundle: true,
  format: 'iife',
  // es2017 keeps async/await + spread but downlevels class private fields so
  // the bundle runs on Android 7-9 stock WebView (same target as the overlay).
  target: ['es2017'],
  platform: 'browser',
  write: false,
  minify: true,
  legalComments: 'none',
}

// Pass 1 — the pdf.js worker as a self-contained classic worker script.
const workerResult = await build({
  ...common,
  entryPoints: [workerEntry],
})
const workerSource = workerResult.outputFiles[0].text

// Pass 2 — the controller (pdf.js main API + @textstack/shared reader math).
const controllerResult = await build({
  ...common,
  entryPoints: [controllerEntry],
})
const controllerSource = controllerResult.outputFiles[0].text

// The generated script sets the worker source as a global (read by the
// controller to build the Blob URL), then runs the controller IIFE.
const scriptText = `window.__TS_PDF_WORKER_SRC=${JSON.stringify(workerSource)};\n${controllerSource}`

const banner = `// AUTO-GENERATED — do not edit.
// Source: apps/web/scripts/pdfViewer/entry.ts + pdfjs-dist legacy worker
// Regenerate: pnpm -C apps/web build:mobile-pdf
//
// IIFE bundle of the Original-layout PDF viewer controller + inlined pdf.js
// legacy worker, transpiled for Android WebView (es2017). Injected into the
// reader WebView by buildPdfViewerHtml() in readerHtml.ts.

/* eslint-disable */
/* prettier-ignore */
`

const fileContent = `${banner}export const PDF_VIEWER_SCRIPT = ${JSON.stringify(scriptText)}\n`

await mkdir(dirname(outFile), { recursive: true })
await writeFile(outFile, fileContent, 'utf8')

const kb = (n) => (n / 1024).toFixed(0)
console.log(
  `wrote ${outFile}\n  worker: ${kb(workerSource.length)} KB · controller: ${kb(controllerSource.length)} KB · total script: ${kb(scriptText.length)} KB`,
)
