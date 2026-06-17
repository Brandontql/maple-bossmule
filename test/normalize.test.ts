import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeStatKey } from "../src/ocr/normalize";

test("normalizeStatKey maps core stats", () => {
  assert.equal(normalizeStatKey("STR"), "STR");
  assert.equal(normalizeStatKey("DEX"), "DEX");
  assert.equal(normalizeStatKey("INT"), "INT");
  assert.equal(normalizeStatKey("LUK"), "LUK");
  assert.equal(normalizeStatKey("All Stats"), "ALL_STAT");
  assert.equal(normalizeStatKey("Allstate"), "ALL_STAT"); // OCR noise
  assert.equal(normalizeStatKey("Max HP"), "MAX_HP");
  assert.equal(normalizeStatKey("MaxHP"), "MAX_HP");
});

test("normalizeStatKey distinguishes Magic ATT from ATT", () => {
  assert.equal(normalizeStatKey("Magic ATT"), "MATT");
  assert.equal(normalizeStatKey("Attack Power"), "ATT");
  assert.equal(normalizeStatKey("Altack Power"), "ATT"); // OCR l/t confusion
});

test("normalizeStatKey recognizes Defense (the missing key)", () => {
  assert.equal(normalizeStatKey("Defense"), "DEF");
  assert.equal(normalizeStatKey("DEF"), "DEF");
});

test("normalizeStatKey maps IED before DEF (label contains 'DEF')", () => {
  // The in-game label is "Ignore Enemy DEF" / "Ignore Enemy Defense" — the
  // word DEF must not win over IED.
  assert.equal(normalizeStatKey("Ignore Enemy DEF"), "IED");
  assert.equal(normalizeStatKey("Ignore Enemy Defense"), "IED");
  assert.equal(normalizeStatKey("IED"), "IED");
});

test("normalizeStatKey requires 'max' for HP/MP so utility lines aren't mis-keyed", () => {
  // "HP Recovery ... Skills Efficiency" must NOT be keyed as MAX_HP (else the
  // roster summary blocklist would hide a real utility potential line).
  assert.equal(normalizeStatKey("HP Recovery Items and Skills Efficiency"), "UNKNOWN");
  assert.equal(normalizeStatKey("MP Cost"), "UNKNOWN");
  // Genuine Max HP/MP lines still map.
  assert.equal(normalizeStatKey("Max HP"), "MAX_HP");
  assert.equal(normalizeStatKey("Max MP"), "MAX_MP");
});

test("normalizeStatKey returns UNKNOWN for unrecognized labels", () => {
  assert.equal(normalizeStatKey("Combat Power"), "UNKNOWN");
  assert.equal(normalizeStatKey(""), "UNKNOWN");
});
