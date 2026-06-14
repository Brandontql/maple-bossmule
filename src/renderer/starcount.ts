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
