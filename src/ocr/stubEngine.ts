import type { EquipmentData } from "../shared/types";
import type { OcrEngine, OcrInput } from "./types";

/**
 * A no-network, deterministic stand-in for a real OCR engine.
 *
 * It does NOT read the image. Instead it returns plausible placeholder data so
 * the whole upload -> crop -> extract -> store -> display pipeline runs end to
 * end before any real engine is wired in. The image size is folded into the
 * output so you can confirm the bytes actually reached the engine.
 */
export class StubEngine implements OcrEngine {
  readonly id = "stub";
  readonly label = "Stub (placeholder, no real OCR)";

  async extract(input: OcrInput): Promise<EquipmentData> {
    const kb = Math.round(input.image.byteLength / 1024);
    return {
      name: "Arcane Umbra Weapon (stub)",
      starforce: 17,
      potentialTier: "Legendary",
      stats: [
        { key: "STR", value: "+255", raw: "STR +255" },
        { key: "ATT", value: "+197", raw: "ATT +197" },
        { key: "BOSS_DMG", value: "35%", raw: "Boss Damage: +35%" },
        { key: "UNKNOWN", value: `${kb}KB`, raw: `received ${kb}KB image` },
      ],
      confidence: 0,
    };
  }
}
