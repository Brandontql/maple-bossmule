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
      category: "Weapon",
      requiredJob: "Magician",
      requiredLevel: 200,
      set: "Arcane Umbra Set",
      tradable: false,
      starForce: 17,
      stats: [
        { key: "INT", isPercent: false, breakdown: { total: 255, base: 100, flame: 90, starforce: 65 }, raw: "INT +255 (100 +90 +65)" },
        { key: "MATT", isPercent: false, breakdown: { total: 197, base: 150, flame: 42, starforce: 5 }, raw: "Magic ATT +197 (150 +42 +5)" },
        { key: "UNKNOWN", isPercent: false, breakdown: { total: kb }, raw: `received ${kb}KB image` },
      ],
      potential: {
        tier: "Legendary",
        lines: [
          { raw: "INT +13%", key: "INT", value: "+13%" },
          { raw: "Boss Damage +35%", key: "BOSS_DMG", value: "+35%" },
        ],
      },
      confidence: 0,
    };
  }
}
