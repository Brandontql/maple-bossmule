# Tesseract Accuracy: Star-Force Counting + Preprocessing — Design Spec

**Date:** 2026-06-14
**Status:** Approved design, pending implementation plan
**Scope:** Renderer-side image analysis. No new dependencies, no model/store/engine-interface changes.

## 1. Context

On a real tooltip, the Tesseract pipeline already reads most *text* lines (stats, level,
job, set, potential) reasonably, but fails two "crucial lines":

- **Star Force** — it's a row of **star icons**, not text. Text OCR can't count icons, so
  `starForce` is always empty (it OCRs the stars as gibberish like "KAREE AAARE").
- **Name** (and some stat **digits**) — genuine OCR misses on light-text-on-dark at low
  resolution (the name came out "poo"; 146 read as 145).

These need image analysis, not OCR tuning. The image is already in the renderer on
capture, so we do the work there with the built-in `<canvas>` (no dependencies). The
counting *logic* is a pure function so it stays unit-testable.

## 2. Goals

1. **Star Force via icon counting** — count the lit/gold star icons at the top of the
   screenshot and fill `starForce` (when the engine didn't provide it).
2. **Better text accuracy** — preprocess the image (upscale + grayscale + contrast +
   invert) before sending it to Tesseract, lifting the **name** and **stat digits**.

## 3. Non-goals (explicit)

- **Full-screen tooltip detection/cropping** — assumes a **tight tooltip screenshot** (the
  user's normal capture). Locating a tooltip inside a full screenshot is the separate,
  deferred cropping problem.
- **Preprocessing for the Vision engine** — Vision needs the original color image (it uses
  color for flame attribution), so preprocessing is applied **only** for the Tesseract/stub
  path.
- **Perfect robustness** — star-counting is a tuned heuristic; expect iteration.
- No new npm dependencies; no change to `EquipmentData`, the store, or the `OcrEngine`
  interface.

## 4. Architecture & data flow

All changes are in the renderer's capture path (`handleFile`). New pure logic lives in a
new `src/renderer/starcount.ts`.

On capture (paste / drop / pick), `handleFile(file)`:
1. Decode the image to pixels via canvas (`createImageBitmap` → draw to canvas →
   `getImageData`) — the **original color** image.
2. `const stars = countStars(pixels, width, height)` — count lit gold stars in the top band.
3. Build the image to send to extraction:
   - If the selected engine is **Tesseract/stub** → a **preprocessed** canvas copy
     (upscaled, grayscale, contrast, invert) exported to base64.
   - If **Vision** → the **original** image base64 (unchanged).
4. `const data = await window.api.extract({ imageBase64, mimeType })` (existing IPC).
5. **Merge:** if `data.starForce == null && stars != null`, set `data.starForce = stars`
   (so Vision's own reading always wins; Tesseract/stub get the counted value).
6. `showPending(data)` — the editable preview shows the result (Star Force now populated and
   still editable).

## 5. Star counting (pure, testable)

`src/renderer/starcount.ts`:

```ts
export function isLitStarPixel(r: number, g: number, b: number): boolean;
export function countStars(pixels: Uint8ClampedArray, width: number, height: number): number | undefined;
```

- **`isLitStarPixel`** — true for the bright gold of a lit star: `r >= 180 && g >= 130 &&
  b <= 130 && (r - b) >= 60`. (Thresholds are constants, tunable.)
- **`countStars`** — examine the **top band** (`height * BAND_FRACTION`, default `0.25`),
  flag lit-gold pixels, group them into connected blobs (4-connectivity flood fill), and
  count blobs whose pixel area is `>= MIN_BLOB` (default `6`). Lit stars across one or two
  rows each form their own blob, so the blob count is the star count. Cap at `MAX_STARS`
  (`30`). Return the count, or `undefined` if `0` (so a no-star image leaves `starForce`
  empty rather than `0`).
- Pure: takes raw RGBA + dimensions; the canvas (renderer) supplies the pixels. Unit-tested
  with synthetic RGBA.

## 6. Preprocessing (renderer canvas)

A renderer helper builds the Tesseract-bound image:
- Draw the source onto a canvas scaled up **2×** (Tesseract reads larger text better).
- Apply `ctx.filter = "grayscale(1) contrast(160%) invert(1)"` before `drawImage`
  (light-on-dark → dark-on-light, higher contrast — much friendlier to Tesseract).
- Export via `canvas.toDataURL("image/png")` → strip the prefix → base64.

Only used for the Tesseract/stub path (per §3). The Vision path sends the original.

## 7. Affected files

- `src/renderer/starcount.ts` — **new**: `isLitStarPixel`, `countStars`, threshold consts.
- `test/starcount.test.ts` — **new**: unit tests for the counting logic.
- `src/renderer/renderer.ts` — rework `handleFile` to: decode via canvas, `countStars`,
  preprocess-for-Tesseract, call extract, merge `starForce`, `showPending`. Add small
  canvas helpers (`imageDataFromFile`, `preprocessedBase64`). Value-import `countStars`
  from `./starcount.js` (`.js` extension per the ESM rule).
- (No change to `index.html`, the model, the store, or the engines.)

## 8. Testing

- **Unit (`node:test`)** for `starcount.ts`:
  - `isLitStarPixel`: gold pixel → true; gray/dark/blue → false.
  - `countStars`: a synthetic RGBA strip with **N** separated gold blobs in the top band →
    returns **N**; all-dark image → `undefined`; blobs below the band are ignored; tiny
    specks below `MIN_BLOB` are ignored.
- **Build:** `npm run typecheck` + `npm run build` green; renderer value import keeps `.js`.
- **Manual (`npm start`):** paste a real tooltip with the Tesseract engine → Star Force is
  filled (count should match the lit stars), and the name/digits read better than before.
  Confirm Vision still gets the original image (Star Force from Vision unchanged).

## 9. Open questions

None. Thresholds (`BAND_FRACTION`, gold cutoffs, `MIN_BLOB`) are expected to be tuned during
implementation against the real sample.
