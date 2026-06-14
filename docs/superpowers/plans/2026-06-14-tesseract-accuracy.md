# Tesseract Accuracy: Star-Force Counting + Preprocessing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill `starForce` by counting the lit star icons in the screenshot, and lift Tesseract's text accuracy (name, digits) by preprocessing the image — all in the renderer, no new dependencies.

**Architecture:** A new pure module `src/renderer/starcount.ts` (`isLitStarPixel`, `countStars`) does the counting over raw RGBA. The renderer's `handleFile` decodes the image with a `<canvas>`, counts stars from the original pixels, sends a preprocessed (upscaled/grayscale/contrast/inverted) copy to Tesseract (or the original to Vision), then merges the counted star force when the engine didn't provide one.

**Tech Stack:** TypeScript, Electron renderer (canvas, native ESM), `node:test`.

**Source of truth:** `docs/superpowers/specs/2026-06-14-tesseract-accuracy-design.md`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/renderer/starcount.ts` | Pure star-icon counting over RGBA pixels | Create |
| `test/starcount.test.ts` | Unit tests for the counting logic | Create |
| `src/renderer/renderer.ts` | `handleFile`: canvas decode, count, preprocess, merge | Modify |

`starcount.ts` is DOM-free (operates on a `Uint8ClampedArray`) so it unit-tests in `node:test`. The renderer supplies pixels via canvas and value-imports it with the `.js` extension (native-ESM rule).

---

## Task 1: Star counting module (starcount.ts)

**Files:**
- Create: `src/renderer/starcount.ts`
- Test: `test/starcount.test.ts`

- [ ] **Step 1: Write the failing tests** — create `test/starcount.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isLitStarPixel, countStars } from "../src/renderer/starcount";

test("isLitStarPixel: gold yes, others no", () => {
  assert.equal(isLitStarPixel(230, 190, 60), true);   // lit gold star
  assert.equal(isLitStarPixel(40, 40, 45), false);    // dark background
  assert.equal(isLitStarPixel(120, 120, 120), false); // gray (unlit star)
  assert.equal(isLitStarPixel(60, 120, 230), false);  // blue
});

/** Dark RGBA canvas with `n` separated 5x5 gold squares in the top band. */
function imageWithStars(n: number, width = 320, height = 100): Uint8ClampedArray {
  const px = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    px[i * 4] = 20; px[i * 4 + 1] = 20; px[i * 4 + 2] = 25; px[i * 4 + 3] = 255;
  }
  for (let s = 0; s < n; s++) {
    const x0 = 5 + s * 15;
    for (let dy = 0; dy < 5; dy++) {
      for (let dx = 0; dx < 5; dx++) {
        const idx = ((5 + dy) * width + (x0 + dx)) * 4;
        px[idx] = 230; px[idx + 1] = 190; px[idx + 2] = 60; px[idx + 3] = 255;
      }
    }
  }
  return px;
}

test("countStars counts N separated gold blobs in the top band", () => {
  assert.equal(countStars(imageWithStars(17), 320, 100), 17);
  assert.equal(countStars(imageWithStars(3), 320, 100), 3);
});

test("countStars returns undefined when there are no gold pixels", () => {
  const w = 320, h = 100;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { px[i * 4] = 20; px[i * 4 + 1] = 20; px[i * 4 + 2] = 25; px[i * 4 + 3] = 255; }
  assert.equal(countStars(px, w, h), undefined);
});

test("countStars ignores gold below the band and specks below MIN_BLOB", () => {
  const w = 320, h = 100;
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { px[i * 4] = 20; px[i * 4 + 1] = 20; px[i * 4 + 2] = 25; px[i * 4 + 3] = 255; }
  // big gold blob LOW (y=80), outside the top 25-row band
  for (let dy = 0; dy < 6; dy++) for (let dx = 0; dx < 6; dx++) {
    const idx = ((80 + dy) * w + (10 + dx)) * 4;
    px[idx] = 230; px[idx + 1] = 190; px[idx + 2] = 60; px[idx + 3] = 255;
  }
  // 2-pixel speck in the band (below MIN_BLOB)
  for (let k = 0; k < 2; k++) {
    const idx = (5 * w + (50 + k)) * 4;
    px[idx] = 230; px[idx + 1] = 190; px[idx + 2] = 60; px[idx + 3] = 255;
  }
  assert.equal(countStars(px, w, h), undefined);
});
```

- [ ] **Step 2: Run tests to verify they fail** — Run: `npm test`. Expected: FAIL — `Cannot find module '../src/renderer/starcount'`.

- [ ] **Step 3: Implement `src/renderer/starcount.ts`**:

```ts
// Counts lit star-force icons in a screenshot's top band. Pure: operates on raw
// RGBA pixels (the renderer supplies them via canvas), so it is unit-testable.

const BAND_FRACTION = 0.25; // search the top quarter of the image
const MIN_BLOB = 6;         // ignore specks smaller than this many pixels
const MAX_STARS = 30;       // sanity cap

/** True for the bright gold of a lit star (not gray unlit stars or dark bg). */
export function isLitStarPixel(r: number, g: number, b: number): boolean {
  return r >= 180 && g >= 130 && b <= 130 && r - b >= 60;
}

/** Count distinct lit-gold blobs in the top band; undefined if none. */
export function countStars(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): number | undefined {
  const bandRows = Math.max(1, Math.round(height * BAND_FRACTION));
  const mask = new Uint8Array(width * bandRows);
  for (let y = 0; y < bandRows; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (isLitStarPixel(pixels[idx], pixels[idx + 1], pixels[idx + 2])) {
        mask[y * width + x] = 1;
      }
    }
  }

  let count = 0;
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== 1) continue;
    let size = 0;
    stack.length = 0;
    stack.push(start);
    mask[start] = 2;
    while (stack.length > 0) {
      const p = stack.pop() as number;
      size++;
      const px = p % width;
      const py = (p / width) | 0;
      if (px > 0 && mask[p - 1] === 1) { mask[p - 1] = 2; stack.push(p - 1); }
      if (px < width - 1 && mask[p + 1] === 1) { mask[p + 1] = 2; stack.push(p + 1); }
      if (py > 0 && mask[p - width] === 1) { mask[p - width] = 2; stack.push(p - width); }
      if (py < bandRows - 1 && mask[p + width] === 1) { mask[p + width] = 2; stack.push(p + width); }
    }
    if (size >= MIN_BLOB) count++;
  }

  if (count === 0) return undefined;
  return Math.min(count, MAX_STARS);
}
```

- [ ] **Step 4: Run tests to verify they pass** — Run: `npm test`. Expected: PASS — all `starcount` tests green plus the existing 24 (total 28).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/starcount.ts test/starcount.test.ts
git commit -m "feat: pure star-force icon counter (countStars)"
```

---

## Task 2: Wire counting + preprocessing into capture (renderer.ts)

**Files:**
- Modify: `src/renderer/renderer.ts`

- [ ] **Step 1: Import the counter**

After the existing `import { tierColor, potentialPercents, toNum, SLOT_LAYOUT } from "./inventory.js";` line, add:

```ts
import { countStars } from "./starcount.js";
```

- [ ] **Step 2: Replace `handleFile` and add canvas helpers**

Replace the entire existing `handleFile` function with the following (keep the existing `arrayBufferToBase64` helper below it — the Vision path still uses it):

```ts
/** Decode an image file to its pixels and a reusable bitmap, via canvas. */
async function decodeImage(
  file: File,
): Promise<{ pixels: Uint8ClampedArray; width: number; height: number; bitmap: ImageBitmap }> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { pixels: img.data, width: bitmap.width, height: bitmap.height, bitmap };
}

/** Upscaled, grayscaled, high-contrast, inverted PNG (base64) for Tesseract. */
function preprocessedBase64(bitmap: ImageBitmap): string {
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width * scale;
  canvas.height = bitmap.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.filter = "grayscale(1) contrast(160%) invert(1)";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png").split(",")[1];
}

async function handleFile(file: File): Promise<void> {
  setStatus("Reading image…");
  try {
    const { pixels, width, height, bitmap } = await decodeImage(file);
    const stars = countStars(pixels, width, height);

    const engine = $<HTMLSelectElement>("engine").value;
    let imageBase64: string;
    let mimeType: string;
    if (engine === "vision-llm") {
      const buf = await file.arrayBuffer();
      imageBase64 = arrayBufferToBase64(buf);
      mimeType = file.type || "image/png";
    } else {
      imageBase64 = preprocessedBase64(bitmap);
      mimeType = "image/png";
    }

    setStatus("Extracting…");
    const data = await window.api.extract({ imageBase64, mimeType });
    if (data.starForce == null && stars != null) {
      data.starForce = stars;
    }
    showPending(data);
    const starNote = stars != null ? ` (counted ★${stars})` : "";
    setStatus(`Extracted from ${file.name}${starNote}. Review, edit if needed, pick a slot, then Save.`);
  } catch (err) {
    setStatus(`Extract failed: ${(err as Error).message}`);
  }
}
```

- [ ] **Step 3: Build + typecheck + test**

Run: `npm run typecheck` → exit 0.
Run: `npm run build` → exit 0. Confirm `dist/renderer/starcount.js` exists and `dist/renderer/renderer.js` contains `from "./starcount.js"`.
Run: `npm test` → 28 pass (renderer not unit-tested; no regression).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/renderer.ts
git commit -m "feat: count star force + preprocess image for Tesseract on capture"
```

---

## Task 3: Verification gate

**Files:** none (verification only)

- [ ] **Step 1: Full checks**

Run: `npm run typecheck` → exit 0.
Run: `npm run build` → exit 0.
Run: `npm test` → all suites PASS (28).

- [ ] **Step 2: Manual (`npm start`) — needs the user**

With the **Tesseract** engine (default):
- Paste/drop a real tooltip screenshot. The status line should show `(counted ★N)`, and the preview's Star Force should be filled with N (matching the lit stars). The name and stat digits should read better than before (preprocessing).
- If the count is off, tune the constants in `starcount.ts` (`BAND_FRACTION`, the `isLitStarPixel` thresholds, `MIN_BLOB`) against the real screenshot and rebuild.

With the **Vision** engine (if `ANTHROPIC_API_KEY` is set):
- Confirm the original (color) image is sent (Star Force comes from Vision; flame colors still attributed correctly).

- [ ] **Step 3: Commit any tuning** (only if Step 2 required threshold changes)

```bash
git add src/renderer/starcount.ts
git commit -m "fix: tune star-counting thresholds against real screenshots"
```

---

## Done criteria

- `npm run typecheck`, `npm run build`, `npm test` (28) all pass.
- On a real tooltip capture with Tesseract, `starForce` is populated by the icon counter and the name/digits read better; the value remains editable.
- Vision still receives the original color image.
- No new dependencies.
