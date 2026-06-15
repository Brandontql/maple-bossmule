// Types shared between the main process, renderer, and OCR engines.

/** A stat's value decomposed by source. Components are color-keyed in the
 *  tooltip (white=base, turquoise=flame, gold=star force); any may be absent.
 *  Plain OCR (Tesseract) loses color, so it sets only `total`. */
export interface StatBreakdown {
  /** The headline number, e.g. 146. */
  total: number;
  /** White component — the item's base stat. */
  base?: number;
  /** Turquoise component — the flame / bonus stat. */
  flame?: number;
  /** Gold component — star force enhancement. */
  starForce?: number;
}

/** A single stat line read from an equipment tooltip. */
export interface StatLine {
  /** Normalized stat key, e.g. "STR", "MATT", "DEF". Unknown lines use "UNKNOWN". */
  key: string;
  /** True for percent lines like "All Stats +5%". */
  isPercent: boolean;
  /** The value decomposed by source. */
  breakdown: StatBreakdown;
  /** The full raw text of the line, kept for debugging/verification. */
  raw: string;
}

/** A single potential line, kept separate from base stats. */
export interface PotentialLine {
  /** The full raw text, e.g. "INT +13%". */
  raw: string;
  /** Normalized key if recognizable, else undefined. */
  key?: string;
  /** The value as shown, e.g. "+13%". */
  value?: string;
}

/** Potential tier + lines, kept separate from base stats. */
export interface PotentialBlock {
  /** Potential tier, e.g. "Legendary", if detected. */
  tier?: string;
  /** The potential lines, e.g. "INT +13%". */
  lines: PotentialLine[];
}

/** Structured data extracted from one equipment tooltip screenshot. */
export interface EquipmentData {
  /** Item name as read from the tooltip. */
  name: string;
  /** Item category, e.g. "Cape". */
  category?: string;
  /** Required job, e.g. "Magician". */
  requiredJob?: string;
  /** Required level, e.g. 160. */
  requiredLevel?: number;
  /** Set name, e.g. "AbsoLab Set (Magician)". */
  set?: string;
  /** Explicitly false when the tooltip shows "Untradable"; undefined means not
   *  detected (true is never set). */
  tradable?: boolean;
  /** Star-force count, if detected. */
  starForce?: number;
  /** Parsed base stat lines. */
  stats: StatLine[];
  /** Potential tier + lines, kept separate from base stats. */
  potential: PotentialBlock;
  /** Confidence 0..1 reported by the engine, if available. */
  confidence?: number;
}

/** The equipment slots a MapleStory character can fill. */
export type EquipmentSlot =
  | "weapon"
  | "secondary"
  | "emblem"
  | "hat"
  | "top"
  | "bottom"
  | "overall"
  | "shoes"
  | "gloves"
  | "cape"
  | "belt"
  | "shoulder"
  | "face"
  | "eye"
  | "earring"
  | "ring1"
  | "ring2"
  | "ring3"
  | "ring4"
  | "pendant1"
  | "pendant2"
  | "pocket"
  | "badge"
  | "medal"
  | "heart"
  | "android";

/** One stored equipment entry: extracted data plus when it was captured. */
export interface EquipmentEntry {
  slot: EquipmentSlot;
  data: EquipmentData;
  /** ISO timestamp of capture. */
  capturedAt: string;
}

/** A tracked character (one of your boss mules). */
export interface Character {
  id: string;
  name: string;
  job?: string;
  /** Overrides the job-inferred main stat (STR/DEX/INT/LUK); absent = infer. */
  mainStat?: string;
  equipment: EquipmentEntry[];
}

/** Top-level persisted state. */
export interface TrackerState {
  characters: Character[];
}
