# Maple BossMule — OCR Equipment Tracker

A desktop app for tracking the equipment of your MapleStory boss mules. You
capture a character's equipment via screenshot, OCR reads the tooltip into
structured data, and the app stores it per character so you can review gear
across your whole roster.

> **Status: Phase 1.5.** The full upload → crop → extract → store → display
> pipeline runs end to end, and three OCR engines are wired in behind one
> interface — pick between them at runtime in the engine dropdown:
>
> - **Stub** — placeholder data, no network. Proves the plumbing.
> - **Tesseract** — offline OCR (`tesseract.js`) + a heuristic tooltip-text
>   parser. Free, no API key; lower accuracy on the game font.
> - **Vision LLM (Claude)** — sends the tooltip image to `claude-opus-4-8`
>   with structured outputs and gets back validated JSON. Most accurate;
>   requires `ANTHROPIC_API_KEY` in the environment.

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
- **`src/ocr/crop.ts` — `cropToTooltip`** — currently a pass-through; the one
  place to add real tooltip-region detection.
- **`src/store/store.ts`** — JSON file store; swap for SQLite later if needed.

## Roadmap

- **Phase 1:** upload + parse (stub) + store + display. ✅
- **Phase 1.5 (current):** Tesseract + vision-LLM engines behind the
  interface. ✅ Next: real tooltip cropping in `cropToTooltip`.
- **Phase 2:** richer tracking UI — history/diffs, totals, upgrade flags.
- **Phase 3:** live MapleStory window capture via `desktopCapturer` + hotkey,
  feeding the same pipeline.

## Develop

```bash
npm install
export ANTHROPIC_API_KEY=sk-...   # only needed for the Vision LLM engine
npm start                         # build + launch Electron
npm run typecheck
```

Persisted data lives in Electron's `userData` dir as `tracker.json`.

Notes:
- The Tesseract engine downloads English language data on first use, which
  needs network access once.
- The Vision LLM engine reads `ANTHROPIC_API_KEY` from the environment; without
  it, selecting that engine surfaces a clear error in the status line.
