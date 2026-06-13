// Types shared between the main process, renderer, and OCR engines.

/** A single stat line read from an equipment tooltip, e.g. "STR +33". */
export interface StatLine {
  /** Normalized stat key, e.g. "STR", "ATT", "BOSS_DMG". Unknown lines use "UNKNOWN". */
  key: string;
  /** Raw value as read, e.g. "+33", "9%". */
  value: string;
  /** The full raw text of the line, kept for debugging/verification. */
  raw: string;
}

/** Structured data extracted from one equipment tooltip screenshot. */
export interface EquipmentData {
  /** Item name as read from the tooltip. */
  name: string;
  /** Star-force count, if detected. */
  starforce?: number;
  /** Potential tier (e.g. "Legendary"), if detected. */
  potentialTier?: string;
  /** Parsed stat lines. */
  stats: StatLine[];
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
  equipment: EquipmentEntry[];
}

/** Top-level persisted state. */
export interface TrackerState {
  characters: Character[];
}
