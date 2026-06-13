# Maple BossMule — OCR Equipment Tracker

A desktop app for tracking the equipment of your MapleStory boss mules. You
capture a character's equipment via screenshot, OCR reads the tooltip into
structured data, and the app stores it per character so you can review gear
across your whole roster.

> **Status: Phase 1 scaffold.** The full upload → crop → extract → store →
> display pipeline runs end to end, but the OCR engine is a **stub** that
> returns placeholder data. The point of this phase is to prove the plumbing
> and give you a harness to evaluate real OCR engines before committing to one.

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
- **`src/ocr/stubEngine.ts`** — the placeholder engine shipped in Phase 1.
- **`src/ocr/crop.ts` — `cropToTooltip`** — currently a pass-through; the one
  place to add real tooltip-region detection.
- **`src/store/store.ts`** — JSON file store; swap for SQLite later if needed.

## Roadmap

- **Phase 1 (this scaffold):** upload + parse (stub) + store + display.
- **Phase 1.5:** real tooltip cropping; plug in a real OCR engine
  (vision-LLM and/or Tesseract adapters).
- **Phase 2:** richer tracking UI — history/diffs, totals, upgrade flags.
- **Phase 3:** live MapleStory window capture via `desktopCapturer` + hotkey,
  feeding the same pipeline.

## Develop

```bash
npm install
npm start        # build + launch Electron
npm run typecheck
```

Persisted data lives in Electron's `userData` dir as `tracker.json`.
