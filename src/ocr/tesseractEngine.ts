import { createWorker, type Worker } from "tesseract.js";
import type { EquipmentData } from "../shared/types";
import { parseTooltipText } from "./parse";
import type { OcrEngine, OcrInput } from "./types";

/**
 * Offline OCR via tesseract.js. No API key required, but accuracy on
 * MapleStory's stylized font is limited without heavy preprocessing — this is
 * the "free / works offline" option to compare against the vision-LLM engine.
 *
 * The worker is created lazily and reused across calls (worker startup +
 * language-data load is expensive). On first run, tesseract.js downloads the
 * English language data; that requires network access once.
 */
export class TesseractEngine implements OcrEngine {
  readonly id = "tesseract";
  readonly label = "Tesseract (offline OCR)";

  private worker: Worker | null = null;

  private async getWorker(): Promise<Worker> {
    if (!this.worker) {
      this.worker = await createWorker("eng");
    }
    return this.worker;
  }

  async extract(input: OcrInput): Promise<EquipmentData> {
    const worker = await this.getWorker();
    const {
      data: { text, confidence },
    } = await worker.recognize(input.image);

    const parsed = parseTooltipText(text);
    // Tesseract reports confidence as 0..100; normalize to 0..1.
    return { ...parsed, confidence: confidence / 100 };
  }

  /** Release the worker. Call on app shutdown if you want a clean exit. */
  async dispose(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }
  }
}
