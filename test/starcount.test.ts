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
