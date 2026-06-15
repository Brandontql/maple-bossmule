import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTooltipText } from "../src/ocr/parse";

// Lines mirroring the real Tesseract output captured on samples/absolab-cape.png.
const NOISY = [
  "KAREE AAARE RAAAR",          // star row OCR'd as letters
  "AbsoLab Mage Cape",          // the real name
  "Untradable",
  "5 Combat Power Inrease",
  "7 E Currently Equipped",
  "Required Level Ly. 160",
  "STR +145 (15+52+79)",
  "Allstate +5% (0% +5%)",
  "MaxHP +255 (0 +255)",
  "Altack Power +48 (2 +45)",
  "Magic ATT +53 (2+45 +6)",
  "Defense +645 (250 +395)",
  "Potential : Legendary",
  "= INT: +13%",
  "= HP Recovery tems and Skills Efiiency +30%",
  "= INT: +10%",
].join("\n");

test("name skips the star row and UI noise", () => {
  const d = parseTooltipText(NOISY);
  assert.equal(d.name, "AbsoLab Mage Cape");
});

test("required level is routed to metadata, not a stat", () => {
  const d = parseTooltipText(NOISY);
  assert.equal(d.requiredLevel, 160);
  assert.ok(!d.stats.some((s) => /required level/i.test(s.raw)));
});

test("untradable sets tradable=false", () => {
  assert.equal(parseTooltipText(NOISY).tradable, false);
});

test("Defense is recognized and noise is dropped", () => {
  const d = parseTooltipText(NOISY);
  const def = d.stats.find((s) => s.key === "DEF");
  assert.ok(def, "DEF stat present");
  assert.equal(def.breakdown.total, 645);
  assert.ok(!d.stats.some((s) => /combat power|currently equipped/i.test(s.raw)));
});

test("stat totals parse; percent flag set; positional breakdown populated", () => {
  const d = parseTooltipText(NOISY);
  const str = d.stats.find((s) => s.key === "STR")!;
  assert.equal(str.breakdown.total, 145);
  assert.equal(str.isPercent, false);
  assert.equal(str.breakdown.base, 15);     // positional from "(15+52+79)"
  assert.equal(str.breakdown.starForce, 52);
  assert.equal(str.breakdown.flame, 79);    // positional; color not needed
  const all = d.stats.find((s) => s.key === "ALL_STAT")!;
  assert.equal(all.isPercent, true);
  assert.equal(all.breakdown.total, 5);
});

test("Magic ATT maps to MATT, not ATT", () => {
  const d = parseTooltipText(NOISY);
  assert.ok(d.stats.some((s) => s.key === "MATT"));
});

test("potential lines are separated from base stats", () => {
  const d = parseTooltipText(NOISY);
  assert.equal(d.potential.tier, "Legendary");
  assert.equal(d.potential.lines.length, 3);
  assert.ok(!d.stats.some((s) => /recovery/i.test(s.raw)));
});

test("name skips low-diversity gibberish (preprocessed star row)", () => {
  // The preprocessed star row OCRs to mixed-case gibberish with few distinct letters.
  const input = ["Ahhh h Ahhh h Ahh hd", "AbsoLab Mage Cape", "STR +100 (100)"].join("\n");
  assert.equal(parseTooltipText(input).name, "AbsoLab Mage Cape");
});

test("base stat lines get positional base/SF/flame from the parenthetical", () => {
  const d = parseTooltipText("STR +146 (15 +52 +79)");
  const s = d.stats.find((x) => x.key === "STR")!;
  assert.equal(s.breakdown.total, 146);
  assert.equal(s.breakdown.base, 15);
  assert.equal(s.breakdown.starForce, 52);
  assert.equal(s.breakdown.flame, 79);
});

test("two-number parenthetical fills base + SF (flame undefined)", () => {
  const d = parseTooltipText("INT +107 (15 +92)");
  const s = d.stats.find((x) => x.key === "INT")!;
  assert.equal(s.breakdown.base, 15);
  assert.equal(s.breakdown.starForce, 92);
  assert.equal(s.breakdown.flame, undefined);
});

test("potential lines are cleaned of markers and junk is dropped", () => {
  const input = [
    "Potential : Legendary",
    "= = Cape",
    "= INT: +13%",
    "= INT: +10%",
  ].join("\n");
  const d = parseTooltipText(input);
  assert.equal(d.potential.lines.length, 2); // junk "= = Cape" dropped
  assert.equal(d.potential.lines[0].raw, "INT +13%"); // no '=' or ':'
  assert.equal(d.potential.lines[0].value, "+13%");
});
