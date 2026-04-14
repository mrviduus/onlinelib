#!/usr/bin/env node
/**
 * TextStack brand asset generator.
 *
 * Sources:
 *   - assets/brand/logo-icon.svg        → detailed mark (hero / large PWA / OG / app-store icon).
 *   - assets/brand/logo-mark-micro.svg  → simplified mark (favicons, small tab icons, email).
 *
 * Route small outputs through the micro mark (legibility at ≤96 px)
 * and large outputs through the detailed mark (the radiating fan reads
 * beautifully at 180 px+).
 *
 * Run with `pnpm run generate:brand` (or `make brand`).
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const rel = (p) => path.relative(repoRoot, p)

const BRAND_INK = '#111827'
const BRAND_WARM = '#F3EEE7'
const WHITE = '#FFFFFF'

const detailedSvgPath = path.join(repoRoot, 'assets/brand/logo-icon.svg')
const microSvgPath = path.join(repoRoot, 'assets/brand/logo-mark-micro.svg')
const detailedSvg = await fs.readFile(detailedSvgPath, 'utf8')
const microSvg = await fs.readFile(microSvgPath, 'utf8')

const recolor = (svg, color) => svg.replace(/fill="currentColor"/g, `fill="${color}"`)

const hexToRgb = (hex) => {
  const n = hex.replace('#', '')
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
    alpha: 1,
  }
}

/**
 * Render an icon SVG to PNG with optional padding and background.
 * `src`: 'detailed' (default) or 'micro'.
 */
async function renderIcon({
  width,
  height,
  padding = 0,
  bg = null,
  color = BRAND_INK,
  src = 'detailed',
  outPath,
}) {
  const sourceSvg = src === 'micro' ? microSvg : detailedSvg
  const inner = Math.min(width, height) - padding * 2
  const coloredSvg = recolor(sourceSvg, color)
  const iconBuf = await sharp(Buffer.from(coloredSvg))
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()

  const canvas = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: bg ? hexToRgb(bg) : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })

  await canvas
    .composite([{ input: iconBuf, left: Math.round((width - inner) / 2), top: Math.round((height - inner) / 2) }])
    .png()
    .toFile(outPath)

  console.log(
    `  ✓ ${rel(outPath)}  (${width}×${height}${bg ? `, bg ${bg}` : ', transparent'}, src: ${src})`,
  )
}

async function writeSvg(outPath, svg) {
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, svg)
  console.log(`  ✓ ${rel(outPath)}`)
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true })
}

console.log('Generating TextStack brand assets…')
console.log(`  detailed: ${rel(detailedSvgPath)}`)
console.log(`  micro:    ${rel(microSvgPath)}`)
console.log(`  brand ink: ${BRAND_INK}`)

await ensureDir(path.join(repoRoot, 'apps/web/public'))
await ensureDir(path.join(repoRoot, 'apps/admin/public/favicon'))
await ensureDir(path.join(repoRoot, 'apps/mobile/assets'))

// ── Web ───────────────────────────────────────────────────────────────────────
const webPublic = path.join(repoRoot, 'apps/web/public')
// Favicon SVG — micro mark, ink color (favicon contexts don't honour currentColor)
await writeSvg(path.join(webPublic, 'favicon.svg'), recolor(microSvg, BRAND_INK))

// Small favicons: micro source
await renderIcon({ width: 16, height: 16, padding: 1, src: 'micro', outPath: path.join(webPublic, 'favicon-16.png') })
await renderIcon({ width: 32, height: 32, padding: 2, src: 'micro', outPath: path.join(webPublic, 'favicon-32.png') })
await renderIcon({
  width: 96,
  height: 96,
  padding: 6,
  src: 'micro',
  outPath: path.join(webPublic, 'favicon-96x96.png'),
})

// Apple touch icon renders at 60–80 px on iOS home screen — detailed is legible.
await renderIcon({
  width: 180,
  height: 180,
  padding: 20,
  bg: WHITE,
  outPath: path.join(webPublic, 'apple-touch-icon.png'),
})
await renderIcon({
  width: 192,
  height: 192,
  padding: 20,
  outPath: path.join(webPublic, 'web-app-manifest-192x192.png'),
})
await renderIcon({
  width: 512,
  height: 512,
  padding: 52,
  outPath: path.join(webPublic, 'web-app-manifest-512x512.png'),
})

// Email-friendly logo: 240×80 — inline images render small in many clients, use micro
await renderIcon({
  width: 240,
  height: 80,
  padding: 8,
  bg: WHITE,
  src: 'micro',
  outPath: path.join(webPublic, 'logo-email.png'),
})

// OG image: 1200×630 — plenty of space, keep detailed mark
await renderIcon({
  width: 1200,
  height: 630,
  padding: 180,
  bg: BRAND_WARM,
  outPath: path.join(webPublic, 'og-image.png'),
})

// ── Admin ─────────────────────────────────────────────────────────────────────
const adminFav = path.join(repoRoot, 'apps/admin/public/favicon')
await writeSvg(path.join(adminFav, 'favicon.svg'), recolor(microSvg, BRAND_INK))
await renderIcon({
  width: 96,
  height: 96,
  padding: 6,
  src: 'micro',
  outPath: path.join(adminFav, 'favicon-96x96.png'),
})

// ── Mobile (Expo) ─────────────────────────────────────────────────────────────
const mobileAssets = path.join(repoRoot, 'apps/mobile/assets')
// App-store icon — must be opaque, large → detailed
await renderIcon({
  width: 1024,
  height: 1024,
  padding: 160,
  bg: WHITE,
  outPath: path.join(mobileAssets, 'icon.png'),
})
await renderIcon({
  width: 1024,
  height: 1024,
  padding: 280,
  outPath: path.join(mobileAssets, 'adaptive-icon.png'),
})
await renderIcon({
  width: 432,
  height: 432,
  padding: 120,
  outPath: path.join(mobileAssets, 'android-icon-foreground.png'),
})
await renderIcon({
  width: 1024,
  height: 1024,
  padding: 360,
  bg: BRAND_WARM,
  outPath: path.join(mobileAssets, 'splash-icon.png'),
})
// Expo web favicon (48 px) — micro
await renderIcon({
  width: 48,
  height: 48,
  padding: 3,
  src: 'micro',
  outPath: path.join(mobileAssets, 'favicon.png'),
})
// In-app tint-friendly asset (white on transparent). Used in mobile home header
// at ~34 px and login at ~64 px via <Image tintColor={…} />. Micro keeps both crisp.
await renderIcon({
  width: 256,
  height: 256,
  padding: 8,
  color: WHITE,
  src: 'micro',
  outPath: path.join(mobileAssets, 'logo-icon.png'),
})

console.log('\nDone.')
