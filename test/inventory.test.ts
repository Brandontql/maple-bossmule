import { test } from "node:test";
import assert from "node:assert/strict";
import { tierColor, potentialPercents, toNum, SLOT_LAYOUT } from "../src/renderer/inventory";
import type { EquipmentData } from "../src/shared/types";

test("tierColor maps tiers (MapleStory scheme); unknown -> neutral", () => {
  assert.equal(tierColor("Legendary"), "#5ac85a");
  assert.equal(tierColor("legendary"), "#5ac85a");
  assert.equal(tierColor("Unique"), "#f0c41b");
  assert.equal(tierColor("Epic"), "#b07cff");
  assert.equal(tierColor("Rare"), "#5aa9ff");
  assert.equal(tierColor(undefined), "#3a3f48");
  assert.equal(tierColor("Nonsense"), "#3a3f48");
});

function withLines(lines: { raw: string; value?: string }[]): EquipmentData {
  return { name: "x", stats: [], potential: { lines } };
}

test("potentialPercents pulls percent tokens, prefixes +, empty when none", () => {
  assert.equal(
    potentialPercents(withLines([{ raw: "INT +13%", value: "+13%" }, { raw: "INT +10%", value: "+10%" }])),
    "+13% +10%",
  );
  assert.equal(potentialPercents(withLines([{ raw: "HP Recovery 30%" }])), "+30%");
  assert.equal(potentialPercents(withLines([{ raw: "Some flat line" }])), "");
  assert.equal(potentialPercents(withLines([])), "");
});

test("toNum: blank/NaN -> undefined; numeric strings parse", () => {
  assert.equal(toNum(""), undefined);
  assert.equal(toNum("   "), undefined);
  assert.equal(toNum("abc"), undefined);
  assert.equal(toNum("17"), 17);
  assert.equal(toNum(" 5 "), 5);
  assert.equal(toNum("-3"), -3);
});

test("SLOT_LAYOUT has 25 placed slots, each unique, none is 'overall'", () => {
  assert.equal(SLOT_LAYOUT.length, 25);
  const slots = SLOT_LAYOUT.map((p) => p.slot);
  assert.equal(new Set(slots).size, 25);
  assert.ok(!slots.includes("overall"));
});
