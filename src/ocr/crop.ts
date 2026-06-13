import type { OcrInput } from "./types";

/**
 * Tooltip crop step.
 *
 * MapleStory equipment tooltips are a high-contrast box that OCR reads far more
 * reliably than the full screenshot. In Phase 1 this is a pass-through: it
 * returns the image unchanged so the pipeline is wired correctly. A real
 * implementation (Phase 1.5+) will locate the tooltip box — e.g. via the
 * dark-panel background colour or a user-drawn selection rectangle — and return
 * only those pixels.
 *
 * Keeping this as a discrete, typed step means swapping in real detection later
 * touches exactly one place.
 */
export async function cropToTooltip(input: OcrInput): Promise<OcrInput> {
  // TODO(phase-1.5): detect tooltip bounds and crop. For now, pass through.
  return input;
}
