import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { Store } from "../src/store/store";

async function tmpFile(contents: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bossmule-"));
  const fp = path.join(dir, "tracker.json");
  await fs.writeFile(fp, contents, "utf8");
  return fp;
}

test("load drops stale-shaped equipment entries, keeps valid ones", async () => {
  // One character with a stale entry (old flat shape) and a valid new-shape entry.
  const state = {
    characters: [
      {
        id: "c1",
        name: "Luminate",
        equipment: [
          { slot: "cape", capturedAt: "2026-01-01T00:00:00Z", data: { name: "Old", starforce: 17, stats: [{ key: "INT", value: "+9" }] } },
          { slot: "hat", capturedAt: "2026-01-02T00:00:00Z", data: { name: "New", stats: [], potential: { lines: [] } } },
        ],
      },
    ],
  };
  const fp = await tmpFile(JSON.stringify(state));
  const store = new Store(fp);
  const chars = await store.getCharacters();
  assert.equal(chars.length, 1);
  const slots = chars[0].equipment.map((e) => e.slot);
  assert.deepEqual(slots, ["hat"]); // stale "cape" entry dropped
});

test("missing file yields empty roster", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bossmule-"));
  const store = new Store(path.join(dir, "nope.json"));
  assert.deepEqual(await store.getCharacters(), []);
});
