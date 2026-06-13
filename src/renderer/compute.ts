import type { EquipmentEntry } from "../shared/types";

/** A summed stat across a character's equipment. */
export interface StatTotal {
  key: string;
  total: number;
  isPercent: boolean;
}

/** A set name and how many equipped pieces belong to it. */
export interface SetCount {
  set: string;
  count: number;
}

/** Sum stats by key across all equipped items. Flat (+N) and percent (N%)
 *  values are summed into separate buckets so they are never mixed. */
export function computeTotals(equipment: EquipmentEntry[]): StatTotal[] {
  const byBucket = new Map<string, StatTotal>();
  for (const entry of equipment) {
    for (const stat of entry.data.stats) {
      const total = stat.breakdown?.total;
      if (typeof total !== "number" || Number.isNaN(total)) continue;
      const bucket = `${stat.key}|${stat.isPercent ? "%" : "+"}`;
      const existing = byBucket.get(bucket);
      if (existing) existing.total += total;
      else byBucket.set(bucket, { key: stat.key, total, isPercent: stat.isPercent });
    }
  }
  return [...byBucket.values()];
}

/** Count equipped pieces per set name. Items with no set are excluded. */
export function computeSetCounts(equipment: EquipmentEntry[]): SetCount[] {
  const counts = new Map<string, number>();
  for (const entry of equipment) {
    const set = entry.data.set;
    if (!set) continue;
    counts.set(set, (counts.get(set) ?? 0) + 1);
  }
  return [...counts.entries()].map(([set, count]) => ({ set, count }));
}
