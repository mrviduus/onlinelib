# Task: wire the new product demo GIF into README

A real demo GIF (`docs/demo.gif`, 190 KB, 4.5s) has been added to the repo. The current README already references `docs/demo.gif` at line 32 but the alt text and surrounding HTML comments describe a different flow (the old "tap-word → translation" idea). Update README to reflect what the GIF actually shows, and add one extra placement so the GIF appears where the feature is explained, not only at the top.

## What the new GIF actually shows

`docs/demo.gif` is a 4.5-second screen recording captured on `textstack.app`:

1. Reader open on *Designing Data-Intensive Applications*, chapter 6 (Trade-offs in Data Systems Architecture)
2. User highlights the phrase **"Extract-Transform-Load (ETL)"**
3. Selection toolbar appears (4 highlight colors, Translate, **Explain (💡)**, TTS, Copy)
4. User clicks 💡
5. **Explanation popup** opens with a **2-3 sentence Spanish explanation**: *"En este contexto, 'Extract-Transform-Load (ETL)' se refiere a un proceso en el que los datos se recogen de diferentes fuentes (extracción), se modifican o limpian según las necesidades (transformación) y luego se almacenan en un lugar central para su análisis (carga). Es como recoger ingredientes de varias tiendas, prepararlos y luego guardarlos en una despensa lista para cocinar."*

It demonstrates the **Explain feature** specifically, not the simpler tap-word translation. Headline message: *select any technical phrase → 2-3 sentence explanation in your native language, with the book's domain in mind, complete with a concrete analogy*.

The GIF intentionally uses **Spanish** rather than Russian for the target language so the asset is politically neutral for international audiences (build-in-public threads, Hacker News, LATAM dev community). Don't swap to Russian.

## Changes to `README.md`

### Change 1 — replace the placeholder block at lines 29–32

Current:

```markdown
<!-- TODO: Replace with actual demo GIF showing tap-word → translation flow -->
<!-- Suggested: 3-5 second GIF, ~600px wide, showing a real DDIA paragraph with a tap interaction -->

![TextStack demo — tap any term, get a context-aware translation](docs/demo.gif)
```

Replace with:

```markdown
![TextStack demo — select any technical phrase, get a 2-3 sentence explanation in your native language](docs/demo.gif)
```

(Drop the two HTML TODO comments — they're stale. The placeholder is filled in.)

### Change 2 — tighten the surrounding lines

Line 27 currently reads:

```markdown
I quit *Designing Data-Intensive Applications* three times before I built this.
```

Keep that line — it's the perfect lead-in for the GIF, because the GIF is filmed on DDIA. No change needed.

The pull-quote line right after the GIF (line 34):

```markdown
> ⭐ Star the repo if you've ever abandoned a technical book mid-way — it's the strongest signal that this kind of tool is worth building.
```

Keep as is — good CTA flow.

### Change 3 — add a second placement deeper in the README

The GIF demonstrates the *Explain* feature, but right now Explain isn't called out anywhere by name in README — it's only mentioned obliquely as "Explanation mode" in the description (line 56-59). Add an explicit feature heading.

Find the "**Reader**" subsection at line 83-90:

```markdown
**Reader**
- Kindle-like experience — themes (light/sepia/dark), fonts, fullscreen,
  keyboard shortcuts
- Text selection — contextual translation in 18+ languages (OpenAI
  `gpt-5-mini`), explanation mode for English-only readers, dictionary
  fallback (Free Dictionary API), highlights
- TTS — Edge TTS via direct WebSocket (200+ voices, 0.75×–2.0× speed, two-
  layer cache)
- Offline reading — PWA with IndexedDB caching, download manager
```

Promote the Explain feature inline. Replace the second bullet ("Text selection — ...") with two bullets:

```markdown
- **Explain** — select any technical phrase → 2-3 sentence explanation in your native language, aware of the book's domain. Uses OpenAI `gpt-5-mini`. Includes a concrete analogy when the term is technical (see GIF above).
- Text selection extras — contextual translation in 18+ languages, dictionary fallback (Free Dictionary API), highlights
```

This way Explain has its own line, the GIF is referenced as the proof, and translation/dictionary remain mentioned but as secondary text-selection capabilities.

### Change 4 — don't break the "Why I built it" link

Line 21 has a link to the dev.to article (`Why I built it`). Keep untouched — it's the lead-in narrative the GIF supports.

## Verification

After applying the changes:

1. `grep "docs/demo.gif" README.md` should return exactly **one** line (the new image tag), not the old TODO comments.
2. Open the README on GitHub (or render locally with `gh readme view`, or just view the file in a markdown previewer). The GIF should auto-play and loop. File size 190 KB — well under any limits.
3. The "Reader" feature list should now have a dedicated **Explain** bullet.
4. No broken image references — `docs/demo.gif` exists, is 190 KB, 4.5s long.

### Change 5 — hero image has been replaced (action: refresh alt text)

`docs/assets/hero.png` has been replaced. The previous hero showed a "calm place to read books online" tagline with classical-literature covers (The Goldfinch, Renaissance paintings) — leftover from an earlier general-reader positioning. It was actively off-message for the current "reader for devs finishing tech books" pitch.

The new `docs/assets/hero.png` (1600×806, 259 KB) is a clean product screenshot of `textstack.app`: DDIA reader text with **Extract-Transform-Load (ETL)** highlighted and the Explain popup open showing the Spanish 2-3 sentence explanation (same flow as `docs/demo.gif`, just frozen at the popup-visible moment). The old hero is preserved as `docs/assets/hero-old-classical.png` in case revert is needed.

In `README.md` line 10:

```markdown
<img src="docs/assets/hero.png" alt="TextStack — a reader for developers finishing English technical books in their native language" width="800">
```

The current alt text is still accurate for the new hero, so **no string change needed** — just confirm the image renders correctly when README is viewed. If you want sharper alignment, optionally tighten alt to:

```markdown
<img src="docs/assets/hero.png" alt="TextStack reader showing an Explain popup over the term 'Extract-Transform-Load' with a 2-3 sentence Spanish explanation" width="800">
```

…but this isn't required. The existing alt is fine.

## Out of scope

- Don't re-record the GIF in a different language. Keep Spanish — it's deliberate (politically neutral, broad audience, demonstrates non-English target).
- Don't move the GIF file to `docs/assets/` — README path expects `docs/demo.gif` and we shouldn't churn paths.
- Don't compress the GIF further — 190 KB at 720p × 4.5s is already a good balance; smaller would degrade text legibility.
- Don't restore the old classical-literature hero from `hero-old-classical.png` — it represents stale positioning, kept only as an audit-trail backup.
