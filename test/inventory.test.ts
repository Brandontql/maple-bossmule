import { test } from "node:test";
import assert from "node:assert/strict";
import { tierColor, potentialPercents, toNum, SLOT_LAYOUT, isRelevantTotal, isRelevantPotential } from "../src/renderer/inventory";
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

test("isRelevantTotal hides off-main base stats, keeps power stats", () => {
  assert.equal(isRelevantTotal("INT", "INT"), true);
  assert.equal(isRelevantTotal("STR", "INT"), false);
  assert.equal(isRelevantTotal("DEX", "INT"), false);
  assert.equal(isRelevantTotal("LUK", "INT"), false);
  assert.equal(isRelevantTotal("MATT", "INT"), true);
  assert.equal(isRelevantTotal("BOSS_DMG", "INT"), true);
  assert.equal(isRelevantTotal("IED", "INT"), true);
  assert.equal(isRelevantTotal("DEF", "INT"), true);
  assert.equal(isRelevantTotal("ALL_STAT", "INT"), true);
  assert.equal(isRelevantTotal("MAX_MP", "INT"), false);
  assert.equal(isRelevantTotal("UNKNOWN", "INT"), false);
});

test("isRelevantTotal with unknown main stat keeps all real stats", () => {
  assert.equal(isRelevantTotal("STR", undefined), true);
  assert.equal(isRelevantTotal("INT", undefined), true);
  assert.equal(isRelevantTotal("UNKNOWN", undefined), false);
  assert.equal(isRelevantTotal("MAX_MP", undefined), false);
});

test("isRelevantPotential hides off-main base stats, keeps everything else", () => {
  // Off-main base stats dropped for a mage.
  assert.equal(isRelevantPotential("STR", "INT"), false);
  assert.equal(isRelevantPotential("DEX", "INT"), false);
  assert.equal(isRelevantPotential("LUK", "INT"), false);
  // Main stat kept.
  assert.equal(isRelevantPotential("INT", "INT"), true);
  // Universal power stats kept regardless of class.
  assert.equal(isRelevantPotential("BOSS_DMG", "INT"), true);
  assert.equal(isRelevantPotential("IED", "INT"), true);
  assert.equal(isRelevantPotential("CRIT_DMG", "INT"), true);
  assert.equal(isRelevantPotential("ALL_STAT", "INT"), true);
  // Unrecognized lines (cooldown reduction, etc.) kept — key is undefined/UNKNOWN.
  assert.equal(isRelevantPotential(undefined, "INT"), true);
  assert.equal(isRelevantPotential("UNKNOWN", "INT"), true);
});

test("isRelevantPotential with unknown main stat keeps all lines", () => {
  assert.equal(isRelevantPotential("STR", undefined), true);
  assert.equal(isRelevantPotential("INT", undefined), true);
  assert.equal(isRelevantPotential(undefined, undefined), true);
});

test("potentialPercents drops off-main base-stat lines when mainStat is given", () => {
  const data = withLines([
    { raw: "INT +9%", value: "+9%" },
    { raw: "STR +12%", value: "+12%" },
    { raw: "Boss Damage +30%", value: "+30%" },
  ]);
  // STR line gets keyed below so the filter can recognize it.
  data.potential.lines[0].key = "INT";
  data.potential.lines[1].key = "STR";
  data.potential.lines[2].key = "BOSS_DMG";
  assert.equal(potentialPercents(data, "INT"), "+9% +30%");
  // Without a main stat, nothing is filtered.
  assert.equal(potentialPercents(data), "+9% +12% +30%");
});
