import type { EquipmentData } from "../shared/types";
import { cropToTooltip } from "./crop";
import { StubEngine } from "./stubEngine";
import { TesseractEngine } from "./tesseractEngine";
import { VisionLlmEngine } from "./visionEngine";
import type { OcrEngine, OcrInput } from "./types";

export type { OcrEngine, OcrInput } from "./types";

/**
 * Registry of available OCR engines. Add real engines here (TesseractEngine,
 * VisionLlmEngine) once implemented; the rest of the app selects by id.
 */
const engines = new Map<string, OcrEngine>();

function register(engine: OcrEngine): void {
  engines.set(engine.id, engine);
}

// Registration order is the dropdown order. A real engine is listed first and
// is the default; the stub is a no-OCR dev placeholder, listed last.
register(new TesseractEngine());
register(new VisionLlmEngine());
register(new StubEngine());

/** Default engine id used until the user/config picks another. */
let activeEngineId = "tesseract";

export function listEngines(): { id: string; label: string }[] {
  return [...engines.values()].map((e) => ({ id: e.id, label: e.label }));
}

export function setActiveEngine(id: string): void {
  if (!engines.has(id)) {
    throw new Error(`Unknown OCR engine: ${id}`);
  }
  activeEngineId = id;
}

export function getActiveEngine(): OcrEngine {
  const engine = engines.get(activeEngineId);
  if (!engine) {
    throw new Error(`Active OCR engine not found: ${activeEngineId}`);
  }
  return engine;
}

/**
 * The full extraction pipeline: crop the tooltip region, then run the active
 * OCR engine. This is the single entry point the IPC layer calls.
 */
export async function extractEquipment(input: OcrInput): Promise<EquipmentData> {
  const cropped = await cropToTooltip(input);
  return getActiveEngine().extract(cropped);
}
