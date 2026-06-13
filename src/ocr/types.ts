import type { EquipmentData } from "../shared/types";

/**
 * Input to an OCR engine: raw image bytes plus optional hint about the
 * already-cropped region. Engines should not assume any particular format
 * beyond what a standard image decoder accepts (PNG/JPEG).
 */
export interface OcrInput {
  /** Decoded image bytes (PNG/JPEG). */
  image: Buffer;
  /** Optional MIME type hint, e.g. "image/png". */
  mimeType?: string;
}

/**
 * Pluggable OCR engine. Phase 1 ships a stub; real engines (vision-LLM,
 * Tesseract) implement this same interface so they can be swapped freely.
 */
export interface OcrEngine {
  /** Stable identifier, e.g. "stub", "tesseract", "vision-llm". */
  readonly id: string;
  /** Human-readable name for the UI. */
  readonly label: string;
  /** Extract structured equipment data from a (cropped) tooltip image. */
  extract(input: OcrInput): Promise<EquipmentData>;
}
