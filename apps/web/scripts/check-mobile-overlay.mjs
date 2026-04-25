#!/usr/bin/env node
// Drift guard for the mobile overlay bundle. Runs the bundler, compares the
// freshly generated file with the committed one, fails non-zero on diff.
// Wire into CI so a PR that edits packages/reader-overlay/src/* without
// regenerating apps/mobile/src/lib/readerOverlayScript.generated.ts fails.

import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..', '..')
const entry = resolve(repoRoot, 'packages/reader-overlay/src/mobileBootstrap.ts')
const outFile = resolve(repoRoot, 'apps/mobile/src/lib/readerOverlayScript.generated.ts')

const result = await build({
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
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
const expected = `${banner}export const READER_OVERLAY_SCRIPT = ${JSON.stringify(`\n${bundleSource}\n`)}\n`

const actual = await readFile(outFile, 'utf8')

if (actual !== expected) {
  console.error(`\n[check:mobile-overlay] ${outFile} is out of date.\n`)
  console.error('Run: pnpm -C apps/web build:mobile-overlay\n')
  process.exit(1)
}

console.log(`[check:mobile-overlay] ${outFile} is up to date.`)
