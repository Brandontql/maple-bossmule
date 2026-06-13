import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTotals, computeSetCounts, type StatTotal, type SetCount } from "../src/renderer/compute";
import type { EquipmentData, EquipmentEntry } from "../src/shared/types";

function entry(slot: string, data: Partial<EquipmentData>): EquipmentEntry {
  return {
    slot: slot as EquipmentEntry["slot"],
    capturedAt: "2026-01-01T00:00:00Z",
    data: { name: "x", stats: [], potential: { lines: [] }, ...data },
  };
}

test("computeTotals sums flat stats by key across items", () => {
  const eq = [
    entry("cape", { stats: [{ key: "INT", isPercent: false, breakdown: { total: 107 }, raw: "" }] }),
    entry("hat", { stats: [{ key: "INT", isPercent: false, breakdown: { total: 93 }, raw: "" }] }),
  ];
  const totals = computeTotals(eq);
  const int = totals.find((t: StatTotal) => t.key === "INT" && !t.isPercent)!;
  assert.equal(int.total, 200);
});

test("computeTotals keeps percent and flat buckets separate", () => {
  const eq = [
    entry("cape", { stats: [{ key: "ALL_STAT", isPercent: true, breakdown: { total: 5 }, raw: "" }] }),
    entry("hat", { stats: [{ key: "ALL_STAT", isPercent: true, breakdown: { total: 4 }, raw: "" }] }),
  ];
  const totals = computeTotals(eq);
  const pct = totals.find((t: StatTotal) => t.key === "ALL_STAT" && t.isPercent)!;
  assert.equal(pct.total, 9);
  assert.equal(pct.isPercent, true);
});

test("computeTotals ignores stats with no usable total", () => {
  const eq = [entry("cape", { stats: [{ key: "STR", isPercent: false, breakdown: { total: 0 }, raw: "" }] })];
  const totals = computeTotals(eq);
  assert.equal(totals.find((t: StatTotal) => t.key === "STR")!.total, 0);
});

test("computeSetCounts groups equipped items by set name", () => {
  const eq = [
    entry("cape", { set: "AbsoLab Set (Magician)" }),
    entry("hat", { set: "AbsoLab Set (Magician)" }),
    entry("shoes", { set: "Arcane Umbra Set" }),
    entry("ring1", {}), // no set
  ];
  const counts = computeSetCounts(eq);
  const abso = counts.find((c: SetCount) => c.set === "AbsoLab Set (Magician)")!;
  assert.equal(abso.count, 2);
  assert.equal(counts.find((c: SetCount) => c.set === "Arcane Umbra Set")!.count, 1);
  assert.equal(counts.length, 2); // items with no set are excluded
});
