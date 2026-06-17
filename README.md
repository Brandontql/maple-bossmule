# Maple BossMule — OCR Equipment Tracker

A desktop app for tracking the equipment of your MapleStory boss mules. You
capture a character's equipment via screenshot, OCR reads the tooltip into
structured data, and the app stores it per character so you can review gear
across your whole roster.

> **Status: Phase 2.** The full capture → extract → review/edit → store →
> roster pipeline runs end to end. Capture by drag-drop, file pick, or **Ctrl+V
> paste**; every extracted field is **editable** before saving (OCR on the game
> font is imperfect, so review is expected). The roster renders as an in-game
> style **paper-doll inventory** per character, with per-character stat totals,
> set counts, and **class-aware filtering** (a mage's roster hides off-main
> STR/DEX/LUK and defensive junk; click any slot to see the full unfiltered
> item).
>
> Three OCR engines are wired in behind one interface — pick at runtime in the
> engine dropdown (**Tesseract is the default**):
>
> - **Tesseract** — offline OCR (`tesseract.js`) + a heuristic tooltip-text
>   parser (`src/ocr/parse.ts`). Free, no API key; lower accuracy on the game
>   font, so the capture flow also **counts star-force icons by pixel analysis**
>   (`src/renderer/starcount.ts`) and **preprocesses** the image (upscale /
>   grayscale / contrast / invert) before OCR.
> - **Vision LLM (Claude)** — sends the tooltip image to `claude-opus-4-8`
>   with structured outputs and gets back validated JSON. Most accurate;
>   requires `ANTHROPIC_API_KEY` in the environment.
> - **Stub** — placeholder data, no network. Proves the plumbing.
>
> Known gaps: the stylized item **name** and color-based flame attribution are
> unreliable under plain OCR (color is unavailable, so base/SF/flame are split
> **positionally**); correct these in the editable preview, or use the Vision
> engine.

## Architecture

```
Electron renderer (UI)           Electron main process
─────────────────────            ─────────────────────
drag-drop screenshot   ──IPC──▶  ocr/  cropToTooltip → OcrEngine.extract
review + pick slot     ──IPC──▶  store/  JSON-file persistence
roster / equipment view ◀─IPC──  (returns characters + equipment)
```

Key seams designed for easy swapping later:

- **`src/ocr/types.ts` — `OcrEngine` interface.** Every engine implements
  `extract(input) → EquipmentData`. Register engines in `src/ocr/index.ts`.
- **`src/ocr/stubEngine.ts` / `tesseractEngine.ts` / `visionEngine.ts`** — the
  three interchangeable engines.
- **`src/ocr/parse.ts` — `parseTooltipText`** — turns raw OCR text into
  structured data (used by the Tesseract engine; the vision engine returns
  structured JSON directly).
- **`src/ocr/normalize.ts` — `normalizeStatKey`** — the shared stat-key
  vocabulary so every engine agrees on keys (STR/MATT/IED/DEF/…). Order is
  significant (specific patterns before broad ones).
- **`src/ocr/crop.ts` — `cropToTooltip`** — currently a pass-through; the one
  place to add real tooltip-region detection.
- **`src/store/store.ts`** — JSON file store; swap for SQLite later if needed.

Renderer-side logic is split into small, unit-tested modules:

- **`src/renderer/inventory.ts`** — paper-doll slot layout, tier colors, and the
  class-aware relevance filters (`isRelevantTotal`, `isRelevantPotential`). The
  potential-summary blocklist (`HIDDEN_POTENTIAL`) lives here.
- **`src/renderer/compute.ts`** — `computeTotals` / `computeSetCounts` aggregate
  a character's equipment for the roster summary.
- **`src/renderer/jobs.ts`** — `jobToMainStat` / `effectiveMainStat` infer a
  character's main stat from its job (with a manual override).
- **`src/renderer/starcount.ts`** — `countStars` pixel-counts lit star-force
  icons in the tooltip's top band.

## Roadmap

- **Phase 1:** upload + parse (stub) + store + display. ✅
- **Phase 1.5:** Tesseract + vision-LLM engines behind the interface. ✅
- **Phase 2 (current):** richer model + paper-doll roster UI. ✅
  - Rich `EquipmentData` (base/SF/flame breakdown, potential block, set,
    metadata); editable preview; Ctrl+V capture. ✅
  - Per-character totals, set counts, class-aware filtering. ✅
  - Star-force icon counting + image preprocessing for Tesseract. ✅
  - Next: history/diffs and upgrade flags; real tooltip cropping in
    `cropToTooltip`; more accurate item-name extraction.
- **Phase 3:** live MapleStory window capture via `desktopCapturer` + hotkey,
  feeding the same pipeline.

## Develop

```bash
npm install
export ANTHROPIC_API_KEY=sk-...   # only needed for the Vision LLM engine
npm start                         # build + launch Electron
npm run typecheck                 # type-check main + renderer
npm test                          # node:test suite (compiles to .test-build/)
```

Tests use the built-in `node:test` runner; sources are compiled via
`tsconfig.test.json` to `.test-build/` and run with `node --test`. The pure
logic modules (`ocr/parse`, `ocr/normalize`, `renderer/inventory`,
`renderer/compute`, `renderer/jobs`, `renderer/starcount`, `store/store`) are
covered there.

Persisted data lives in Electron's `userData` dir as `tracker.json`.

Notes:
- The Tesseract engine downloads English language data on first use, which
  needs network access once.
- The Vision LLM engine reads `ANTHROPIC_API_KEY` from the environment; without
  it, selecting that engine surfaces a clear error in the status line.
