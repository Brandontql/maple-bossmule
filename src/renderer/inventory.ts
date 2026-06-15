import type { EquipmentData, EquipmentSlot } from "../shared/types";

/** Border color for a potential tier (MapleStory scheme):
 *  Rare=blue, Epic=purple, Unique=gold, Legendary=green; unknown -> neutral. */
export function tierColor(tier: string | undefined): string {
  switch ((tier ?? "").toLowerCase()) {
    case "legendary": return "#5ac85a";
    case "unique": return "#f0c41b";
    case "epic": return "#b07cff";
    case "rare": return "#5aa9ff";
    default: return "#3a3f48";
  }
}

/** Compact "+13% +10%" of percent tokens in an item's potential lines; "" if none.
 *  When `mainStat` is given, off-main base-stat lines are dropped (a mage's stray
 *  STR/DEX/LUK potentials), keeping main-stat + universal lines (cooldown, crit,
 *  boss, etc.). */
export function potentialPercents(data: EquipmentData, mainStat?: string): string {
  const out: string[] = [];
  for (const line of data.potential.lines) {
    if (!isRelevantPotential(line.key, mainStat)) continue;
    const src = line.value ?? line.raw ?? "";
    const m = src.match(/[+-]?\d+%/);
    if (!m) continue;
    out.push(/^[+-]/.test(m[0]) ? m[0] : `+${m[0]}`);
  }
  return out.join(" ");
}

/** Parse a user-entered number; blank/NaN -> undefined. */
export function toNum(value: string): number | undefined {
  const t = value.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isNaN(n) ? undefined : n;
}

/** Fixed paper-doll slot positions in a 5-column grid. Column 3 rows 1-5 are the
 *  center summary panel (not a slot); `overall` is handled dynamically (it takes
 *  the Top+Bottom area when worn), so it is intentionally absent here. */
export const SLOT_LAYOUT: { slot: EquipmentSlot; col: number; row: number }[] = [
  { slot: "ring1", col: 1, row: 1 }, { slot: "ring2", col: 1, row: 2 },
  { slot: "ring3", col: 1, row: 3 }, { slot: "ring4", col: 1, row: 4 },
  { slot: "belt", col: 1, row: 5 }, { slot: "pocket", col: 1, row: 6 },
  { slot: "face", col: 2, row: 1 }, { slot: "eye", col: 2, row: 2 },
  { slot: "earring", col: 2, row: 3 }, { slot: "pendant1", col: 2, row: 4 },
  { slot: "pendant2", col: 2, row: 5 }, { slot: "weapon", col: 2, row: 6 },
  { slot: "secondary", col: 3, row: 6 },
  { slot: "hat", col: 4, row: 1 }, { slot: "top", col: 4, row: 2 },
  { slot: "bottom", col: 4, row: 3 }, { slot: "shoulder", col: 4, row: 4 },
  { slot: "android", col: 4, row: 5 }, { slot: "emblem", col: 4, row: 6 },
  { slot: "cape", col: 5, row: 1 }, { slot: "gloves", col: 5, row: 2 },
  { slot: "shoes", col: 5, row: 3 }, { slot: "medal", col: 5, row: 4 },
  { slot: "heart", col: 5, row: 5 }, { slot: "badge", col: 5, row: 6 },
];

const PRIMARY_STATS = new Set(["STR", "DEX", "INT", "LUK"]);

/** Whether a stat key belongs in the filtered roster totals for a character whose
 *  main stat is `mainStat`. Hides off-main base stats (and MP/UNKNOWN); an
 *  undefined main stat (unknown class) keeps all real stats. */
export function isRelevantTotal(key: string, mainStat: string | undefined): boolean {
  if (key === "UNKNOWN" || key === "MAX_MP") return false;
  if (!mainStat) return true;
  if (PRIMARY_STATS.has(key) && key !== mainStat) return false;
  return true;
}

/** Whether a potential line belongs in the filtered roster view. Hides off-main
 *  base-stat potentials (a mage's STR/DEX/LUK%) but KEEPS everything else —
 *  including main stat, cooldown/crit/boss and unrecognized (UNKNOWN) lines like
 *  "Cooldown Reduction" — since those matter regardless of class. */
export function isRelevantPotential(key: string | undefined, mainStat: string | undefined): boolean {
  if (!mainStat) return true;
  if (key && PRIMARY_STATS.has(key) && key !== mainStat) return false;
  return true;
}
