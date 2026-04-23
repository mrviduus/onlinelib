# Slice 10 — legacy cleanup target list

Grep-zero criterion for slice 10: after deletion, the command below MUST return 0 matches across `apps/web/src/` and `apps/mobile/src/`:

```bash
grep -rE "HighlightLayer|VocabWordLayer|ReaderContent|useScrollReader|\\.vocab-underline|\\.vocab-inline-translation" \
  apps/web/src apps/mobile/src
```

## Hard-delete targets

Every file below is marked with `// TODO(overlay-v2 slice-10): remove` in its header. Remove the file AND every import/reference.

### Web

| Path | Superseded by |
|---|---|
| `apps/web/src/components/reader/HighlightLayer.tsx` | `HighlightOverlayLayer.tsx` |
| `apps/web/src/components/reader/VocabWordLayer.tsx` | `VocabOverlayLayer.tsx` |
| `apps/web/src/components/reader/ReaderContent.tsx` | `ReaderSection.tsx` |
| `apps/web/src/hooks/useScrollReader.ts` | `ReaderSection` single-chapter model |
| `apps/web/src/styles/reader.css` — `.vocab-underline*` rules (block starting ~line 1725) | SVG overlay styling |
| `apps/web/src/styles/reader.css` — `.vocab-inline-translation` rules (~line 1771) | `VocabTranslationOverlay` |

### Web — dispatcher/middle-tier (evaluate before delete)

Keep after slice 10 only if overlay path has a proven regression on a supported browser. Default: also delete.

| Path | Reason to keep (if any) |
|---|---|
| `apps/web/src/components/reader/VocabHighlightLayer.tsx` (CSS Custom Highlight path) | Fallback for browsers without SVG overlay perf |
| `apps/web/src/components/reader/VocabHighlightDispatcher.tsx` | Collapse into direct `VocabOverlayLayer` render |
| `apps/web/src/lib/customHighlightRegistry.ts` | Dead if VocabHighlightLayer goes |

### Mobile

| Path | Action |
|---|---|
| `apps/mobile/src/lib/readerHtml.ts` — `<mark>`-wrapping `renderHighlight`, `markVocabWords`, `vhlLegacyMark` functions | Replace with `READER_OVERLAY_SCRIPT` interpolation + overlay API calls |
| `apps/mobile/src/lib/readerHtml.ts` — `VOCAB_STAGE_COLORS`, `VOCAB_ATTR` constants if unused after swap | Delete |

### ReaderPage

| File | Change |
|---|---|
| `apps/web/src/pages/ReaderPage.tsx` | Remove the `overlayV2Enabled ? ... : <ReaderContent />` branch — keep only the `ReaderSection` path. Remove `scrollReader`, `chapterScrollProgress`, `calculatedProgress` legacy branch, `overlayScrollProgress` becomes the single source of truth. |

### Feature flag

| File | Change |
|---|---|
| `apps/web/src/lib/features.ts` | Delete `readerOverlayV2` key + `isReaderOverlayKillswitchSet`. |
| `apps/web/src/components/reader/ReaderHighlights.tsx` | Remove the flag branch — always mount `HighlightOverlayLayer`. |
| `apps/web/src/components/reader/VocabHighlightDispatcher.tsx` | Remove `decide()` → always return `'overlay'` (or collapse into direct render). |
| `apps/web/src/pages/ReaderPage.tsx` | Same — remove the flag branch. |
| `apps/web/src/lib/vocabHighlightTelemetry.ts` | Remove `'boot.overlay'` event if no longer useful, otherwise keep as baseline. |

## Ordering

Slice 10 ships as its **own PR** after slice 9 has been at 100% rollout for ≥ 4 weeks with no regressions. If we roll back during slice 9, slice 10 stays un-shipped — reverting rollout must not lose the cleanup work.

## Done criterion

1. `grep -rE` command at top returns 0 matches.
2. No import statements reference deleted files.
3. `pnpm -C apps/web test` green.
4. `pnpm -C apps/web build` green.
5. Full manual smoke: highlight round-trip, vocab tap, search jump, TTS, chapter prev/next — web + mobile.
