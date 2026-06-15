import { test } from "node:test";
import assert from "node:assert/strict";
import { jobToMainStat, effectiveMainStat } from "../src/renderer/jobs";
import type { Character } from "../src/shared/types";

test("jobToMainStat maps common classes; unknown -> undefined", () => {
  assert.equal(jobToMainStat("Mage"), "INT");
  assert.equal(jobToMainStat("bishop"), "INT");
  assert.equal(jobToMainStat("Hero"), "STR");
  assert.equal(jobToMainStat("Marksman"), "DEX");
  assert.equal(jobToMainStat("Shadower"), "LUK");
  assert.equal(jobToMainStat("Night Lord"), "LUK");
  assert.equal(jobToMainStat(""), undefined);
  assert.equal(jobToMainStat(undefined), undefined);
  assert.equal(jobToMainStat("Totally Made Up"), undefined);
});

function ch(p: Partial<Character>): Character {
  return { id: "c", name: "n", equipment: [], ...p };
}

test("effectiveMainStat: override wins, else infer, else undefined", () => {
  assert.equal(effectiveMainStat(ch({ mainStat: "STR", job: "Mage" })), "STR");
  assert.equal(effectiveMainStat(ch({ job: "Bishop" })), "INT");
  assert.equal(effectiveMainStat(ch({ job: "Mystery Class" })), undefined);
});
