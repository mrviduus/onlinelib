#!/usr/bin/env node
// Bundles packages/reader-overlay/src/mobileBootstrap.ts into a single
// vanilla-JS IIFE and writes it as a string constant to
// apps/mobile/src/lib/readerOverlayScript.generated.ts.
//
// Run via `pnpm -C apps/web build:mobile-overlay` (also called from CI to
// detect drift — fails if the generated file changes after a fresh build).

import { build } from 'esbuild'
import { writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..', '..')
const entry = resolve(repoRoot, 'packages/reader-overlay/src/mobileBootstrap.ts')
const outFile = resolve(repoRoot, 'apps/mobile/src/lib/readerOverlayScript.generated.ts')

const result = await build({
  entryPoints: [entry],
  // Fixed, because esbuild writes source paths in the bundle RELATIVE TO CWD.
  // Without it the same source produced two different bundles depending on
  // whether the script was run from the repo root or from apps/web, and the
  // drift guard reported a clean tree as out of date.
  absWorkingDir: resolve(__dirname, '..'),
  bundle: true,
  format: 'iife',
  // es2017 keeps async/await + spread/rest but downlevels class private
  // fields (#x) so the bundle runs on Android 7-9 stock WebView.
  target: ['es2017'],
  platform: 'browser',
  write: false,
  minify: false,
  legalComments: 'none',
})

const bundleSource = result.outputFiles[0].text.trim()

const banner = `// AUTO-GENERATED — do not edit.
// Source: packages/reader-overlay/src/mobileBootstrap.ts
// Regenerate: pnpm -C apps/web build:mobile-overlay
//
// IIFE bundle of the shared @textstack/reader-overlay package, transpiled
// for Android WebView (es2017). Injected into the WebView by readerHtml.ts.

/* eslint-disable */
/* prettier-ignore */
`

const fileContent = `${banner}export const READER_OVERLAY_SCRIPT = ${JSON.stringify(`\n${bundleSource}\n`)}\n`

await mkdir(dirname(outFile), { recursive: true })
await writeFile(outFile, fileContent, 'utf8')

console.log(`wrote ${outFile} (${bundleSource.length} chars bundle)`)
