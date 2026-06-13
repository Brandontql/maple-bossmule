import type { EquipmentData } from "../shared/types";

/** TEMPORARY stub — replaced with the real heuristic parser in Task 4. */
export function parseTooltipText(text: string): EquipmentData {
  return {
    name: "Unknown item",
    stats: [],
    potential: { lines: [] },
    confidence: undefined,
  };
}
