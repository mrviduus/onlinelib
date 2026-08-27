// The bundling of the Original-layout PDF viewer, in one place.
//
// Both the writer (`build-mobile-pdf.mjs`) and the CI freshness guard
// (`check-mobile-pdf.mjs`) call this. They used to be the kind of pair that
// duplicates its build config and then disagrees about it — which is exactly the
// failure the guard exists to catch, so having it in the guard would be absurd.
//
// Two esbuild passes (ADR-012 S4b):
//   1. WORKER  — pdfjs-dist legacy worker → classic IIFE, inlined as a string so
//      the controller can spin it up from a Blob URL (a real off-thread worker,
//      NOT the fake main-thread fallback) inside the RN WebView.
//   2. CONTROLLER — entry.ts (pdf.js main API + shared virtualization math).

import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..', '..', '..')
const require = createRequire(import.meta.url)

export const OUT_FILE = resolve(repoRoot, 'apps/mobile/src/lib/pdfViewerScript.generated.ts')

const controllerEntry = resolve(__dirname, 'entry.ts')
// Resolve through node (pnpm) rather than a hard path — pdfjs lives under
// apps/web/node_modules/.pnpm, not the repo-root node_modules.
const workerEntry = require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs')

const common = {
  // Fixed, for the same reason as the overlay bundle: esbuild writes source
  // paths relative to CWD. The PDF bundle is minified, so those paths do not
  // survive into the output today and the guard happened to be immune — which
  // is luck, not a property worth relying on.
  absWorkingDir: resolve(__dirname, '..', '..'),
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

const BANNER = `// AUTO-GENERATED — do not edit.
// Source: apps/web/scripts/pdfViewer/entry.ts + pdfjs-dist legacy worker
// Regenerate: pnpm -C apps/web build:mobile-pdf
//
// IIFE bundle of the Original-layout PDF viewer controller + inlined pdf.js
// legacy worker, transpiled for Android WebView (es2017). Injected into the
// reader WebView by buildPdfViewerHtml() in readerHtml.ts.

/* eslint-disable */
/* prettier-ignore */
`

/** @returns {Promise<{ fileContent: string, workerKb: number, controllerKb: number, totalKb: number }>} */
export async function buildPdfViewerFile() {
  const workerResult = await build({ ...common, entryPoints: [workerEntry] })
  const workerSource = workerResult.outputFiles[0].text

  const controllerResult = await build({ ...common, entryPoints: [controllerEntry] })
  const controllerSource = controllerResult.outputFiles[0].text

  // The generated script sets the worker source as a global (read by the
  // controller to build the Blob URL), then runs the controller IIFE.
  const scriptText = `window.__TS_PDF_WORKER_SRC=${JSON.stringify(workerSource)};\n${controllerSource}`
  const fileContent = `${BANNER}export const PDF_VIEWER_SCRIPT = ${JSON.stringify(scriptText)}\n`

  return {
    fileContent,
    workerKb: Math.round(workerSource.length / 1024),
    controllerKb: Math.round(controllerSource.length / 1024),
    totalKb: Math.round(scriptText.length / 1024),
  }
}
