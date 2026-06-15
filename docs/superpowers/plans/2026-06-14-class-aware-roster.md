# Class-Aware Roster + Readability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-character main stat (inferred from job, overridable), filter roster/inventory totals to the relevant stats, show item names in slot cells, fix the summary overflow, parse base/SF/flame positionally, and clean potential lines.

**Architecture:** Pure helpers in new `jobs.ts` and extended `inventory.ts`/`parse.ts` carry the testable logic; a small `Character.mainStat` field + `updateCharacter` store/IPC persist the override; the renderer wires the dropdowns, the filtered totals, and the cell item names.

**Tech Stack:** TypeScript, Electron (main + native-ESM renderer), `node:test`.

**Source of truth:** `docs/superpowers/specs/2026-06-14-class-aware-roster-design.md`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/renderer/jobs.ts` | `jobToMainStat`, `effectiveMainStat` (pure) | Create |
| `test/jobs.test.ts` | Tests for job→stat | Create |
| `src/renderer/inventory.ts` | add `isRelevantTotal` | Modify |
| `test/inventory.test.ts` | add `isRelevantTotal` tests | Modify |
| `src/ocr/parse.ts` | positional breakdown + clean potential lines | Modify |
| `test/parse.test.ts` | add breakdown + potential-cleaning tests | Modify |
| `src/shared/types.ts` | `Character.mainStat?` | Modify |
| `src/shared/ipc.ts` | `updateCharacter` channel/request/api; `AddCharacterRequest.mainStat?` | Modify |
| `src/store/store.ts` | `addCharacter` takes `mainStat`; `updateCharacter` | Modify |
| `src/main/ipc.ts` | `updateCharacter` handler | Modify |
| `src/main/preload.ts` | `updateCharacter` bridge | Modify |
| `src/renderer/renderer.ts` | main-stat selects, filtered totals, item names in cells | Modify |
| `src/renderer/index.html` | add-char Main-stat select; cell/summary CSS | Modify |

Pure logic (jobs, isRelevantTotal, parser) is `node:test`-covered; the renderer/IPC is build + manual-verified. Renderer value-imports `jobs.js`/`inventory.js` with `.js` (native-ESM rule).

---

## Task 1: Job → main stat (jobs.ts)

**Files:** Modify `src/shared/types.ts`, Create `src/renderer/jobs.ts`, Test `test/jobs.test.ts`.

- [ ] **Step 0: Add `mainStat` to `Character`** (prerequisite — `jobs.ts` and its test read it) — in `src/shared/types.ts`, add to the `Character` interface, after the `job?` field:

```ts
  /** Overrides the job-inferred main stat (STR/DEX/INT/LUK); absent = infer. */
  mainStat?: string;
```

- [ ] **Step 1: Write the failing tests** — `test/jobs.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify fail** — `npm test` → FAIL (`Cannot find module '../src/renderer/jobs'`).

- [ ] **Step 3: Implement `src/renderer/jobs.ts`**:

```ts
import type { Character } from "../shared/types";

type Primary = "STR" | "DEX" | "INT" | "LUK";

// Order: INT, STR, DEX, LUK. Patterns are case-insensitive keyword matches.
const JOB_STAT: ReadonlyArray<readonly [RegExp, Primary]> = [
  [/magician|mage|wizard|bishop|arch ?mage|fire|poison|ice|lightning|evan|luminous|battle ?mage|kanna|illium|kinesis|lara|beast ?tamer/, "INT"],
  [/warrior|hero|paladin|dark ?knight|dawn ?warrior|aran|kaiser|hayato|blaster|demon ?slayer|demon ?avenger|mihile|zero|adele/, "STR"],
  [/archer|bowman|hunter|ranger|marksman|sniper|pathfinder|wind ?archer|mercedes|wild ?hunter|kain/, "DEX"],
  [/thief|rogue|assassin|bandit|night ?lord|shadower|dual ?blade|night ?walker|phantom|cadena|hoyoung/, "LUK"],
];

/** Infer a character's primary stat from its job text, or undefined if unknown. */
export function jobToMainStat(job: string | undefined): Primary | undefined {
  if (!job) return undefined;
  const j = job.toLowerCase();
  for (const [re, stat] of JOB_STAT) if (re.test(j)) return stat;
  return undefined;
}

/** The stat a character is built around: explicit override, else inferred from
 *  the job, else undefined (unknown class). */
export function effectiveMainStat(c: Character): string | undefined {
  return c.mainStat ?? jobToMainStat(c.job);
}
```

- [ ] **Step 4: Run to verify pass** — `npm test` → PASS (all jobs tests + existing 30 = 32).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/jobs.ts test/jobs.test.ts
git commit -m "feat: infer character main stat from job (jobToMainStat)"
```


---

## Task 2: Relevant-stat filter (inventory.ts)

**Files:** Modify `src/renderer/inventory.ts`, Test `test/inventory.test.ts`.

- [ ] **Step 1: Add the failing test** — append to `test/inventory.test.ts`:

```ts
import { isRelevantTotal } from "../src/renderer/inventory";

test("isRelevantTotal hides off-main base stats, keeps power stats", () => {
  // mage (INT): hide STR/DEX/LUK + MAX_MP + UNKNOWN; keep the rest
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
```

- [ ] **Step 2: Run to verify fail** — `npm test` → FAIL (`isRelevantTotal` not exported).

- [ ] **Step 3: Add to `src/renderer/inventory.ts`** (append at the end of the file):

```ts
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
```

- [ ] **Step 4: Run to verify pass** — `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/inventory.ts test/inventory.test.ts
git commit -m "feat: relevant-stat filter (isRelevantTotal)"
```

---

## Task 3: Positional breakdown + clean potential lines (parse.ts)

**Files:** Modify `src/ocr/parse.ts`, Test `test/parse.test.ts`.

- [ ] **Step 1: Add failing tests** — append to `test/parse.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify fail** — `npm test` → FAIL (breakdown sub-fields undefined; junk line present; raw has `=`).

- [ ] **Step 3: Edit `src/ocr/parse.ts`**

(a) Add two helpers next to the existing `parseLeadingValue` helper:

```ts
/** Positional breakdown from the parenthetical, e.g. "(15 +52 +79)".
 *  Order is base, star force, flame (color is unavailable to plain OCR). */
function parseParenBreakdown(line: string): {
  base?: number;
  starForce?: number;
  flame?: number;
} {
  const paren = line.match(/\(([^)]*)\)/);
  if (!paren) return {};
  const nums = (paren[1].match(/[+-]?\d[\d,]*/g) ?? [])
    .map((n) => parseInt(n.replace(/,/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const out: { base?: number; starForce?: number; flame?: number } = {};
  if (nums[0] != null) out.base = nums[0];
  if (nums[1] != null) out.starForce = nums[1];
  if (nums[2] != null) out.flame = nums[2];
  return out;
}

/** Strip OCR bullet/colon markers from a potential line for clean display. */
function cleanPotentialText(line: string): string {
  return line
    .replace(POT_MARKER_RE, "")
    .replace(/^[\s=:•·*-]+/, "")
    .replace(/:/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
```

(b) In the base-stat push, merge the parenthetical breakdown. Replace:

```ts
      stats.push({
        key: normalizeStatKey(label || line),
        isPercent: parsed.isPercent,
        breakdown: { total: parsed.total }, // color unavailable -> no base/flame/sf
        raw: line,
      });
```

with:

```ts
      stats.push({
        key: normalizeStatKey(label || line),
        isPercent: parsed.isPercent,
        breakdown: { total: parsed.total, ...parseParenBreakdown(line) },
        raw: line,
      });
```

(c) Drop junk potential lines and clean the raw. In the `valIdx < 0` block, replace:

```ts
    if (valIdx < 0) {
      if (isPotential) potentialLines.push({ raw: line });
      continue;
    }
```

with:

```ts
    if (valIdx < 0) {
      continue; // no number -> not a real stat/potential line (drops "= = Cape")
    }
```

And in the potential push, use the cleaned text. Replace:

```ts
    if (isPotential) {
      potentialLines.push({
        raw: line,
        key: label ? normalizeStatKey(label) : undefined,
        value: rest.replace(/\s+/g, "").replace(/\(.*$/, "") || undefined,
      });
    }
```

with:

```ts
    if (isPotential) {
      potentialLines.push({
        raw: cleanPotentialText(line),
        key: label ? normalizeStatKey(label) : undefined,
        value: rest.replace(/\s+/g, "").replace(/\(.*$/, "") || undefined,
      });
    }
```

- [ ] **Step 4: Run to verify pass** — `npm test` → PASS (new tests + the existing parse tests still green; the "potential lines are separated" test still sees 3 cleaned lines for its fixture).

- [ ] **Step 5: Commit**

```bash
git add src/ocr/parse.ts test/parse.test.ts
git commit -m "feat: positional base/SF/flame + cleaned potential lines"
```

---

## Task 4: mainStat model + store + IPC

**Files:** Modify `src/shared/ipc.ts`, `src/store/store.ts`, `src/main/ipc.ts`, `src/main/preload.ts`. (`Character.mainStat?` was already added in Task 1, Step 0.)

- [ ] **Step 1: Update `src/shared/ipc.ts`**

Add to the `Channels` object:

```ts
  updateCharacter: "store:updateCharacter",
```

Add `mainStat` to `AddCharacterRequest`:

```ts
export interface AddCharacterRequest {
  name: string;
  job?: string;
  mainStat?: string;
}
```

Add a new request type (next to the others):

```ts
export interface UpdateCharacterRequest {
  characterId: string;
  mainStat?: string;
}
```

Add to the `TrackerApi` interface:

```ts
  updateCharacter(req: UpdateCharacterRequest): Promise<Character>;
```

- [ ] **Step 2: Update `src/store/store.ts`**

Change `addCharacter` to accept `mainStat`:

```ts
  async addCharacter(name: string, job?: string, mainStat?: string): Promise<Character> {
    await this.ensureLoaded();
    const character: Character = {
      id: randomUUID(),
      name,
      job,
      mainStat,
      equipment: [],
    };
    this.state.characters.push(character);
    await this.save();
    return character;
  }
```

Add `updateCharacter` (after `addCharacter`):

```ts
  async updateCharacter(characterId: string, mainStat: string | undefined): Promise<Character> {
    await this.ensureLoaded();
    const character = this.state.characters.find((c) => c.id === characterId);
    if (!character) {
      throw new Error(`Character not found: ${characterId}`);
    }
    character.mainStat = mainStat;
    await this.save();
    return character;
  }
```

- [ ] **Step 3: Update `src/main/ipc.ts`**

Add `UpdateCharacterRequest` to the type imports from `../shared/ipc`, then register the handler (next to `addCharacter`):

```ts
  ipcMain.handle(Channels.addCharacter, (_evt, req: AddCharacterRequest) =>
    store.addCharacter(req.name, req.job, req.mainStat),
  );

  ipcMain.handle(Channels.updateCharacter, (_evt, req: UpdateCharacterRequest) =>
    store.updateCharacter(req.characterId, req.mainStat),
  );
```

(The `addCharacter` handler line replaces the existing one to pass `req.mainStat`.)

- [ ] **Step 4: Update `src/main/preload.ts`**

Add `UpdateCharacterRequest` to the type imports, and add the bridge method (next to `addCharacter`):

```ts
  updateCharacter: (req: UpdateCharacterRequest) =>
    ipcRenderer.invoke(Channels.updateCharacter, req),
```

- [ ] **Step 5: Build + test**

Run: `npm run typecheck` → exit 0.
Run: `npm run build` → exit 0.
Run: `npm test` → all pass (the type change keeps prior tests green).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/ipc.ts src/store/store.ts src/main/ipc.ts src/main/preload.ts
git commit -m "feat: persist per-character mainStat (updateCharacter IPC)"
```

---

## Task 5: Renderer + HTML (selects, filtered totals, item names, CSS)

**Files:** Modify `src/renderer/renderer.ts`, `src/renderer/index.html`.

- [ ] **Step 1: index.html — add the Main-stat select + CSS**

In the add-character row (the `.row` with `charName`/`charJob`/`addChar`), add before the Add button:

```html
          <select id="charMainStat" title="Main stat">
            <option value="">Main: Auto</option>
            <option value="STR">STR</option>
            <option value="DEX">DEX</option>
            <option value="INT">INT</option>
            <option value="LUK">LUK</option>
          </select>
```

In `<style>`, after the `.pd-name` rule, add:

```css
      .pd-item { font-size: 9px; color: #cde; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.1; }
      .pd-summary { min-width: 0; overflow: hidden; }
      .pd-summary .muted { overflow-wrap: anywhere; max-width: 100%; }
      .ms-row { display: flex; align-items: center; gap: 6px; margin: 4px 0 8px; font-size: 12px; }
```

- [ ] **Step 2: renderer.ts — imports**

After `import { tierColor, potentialPercents, toNum, SLOT_LAYOUT } from "./inventory.js";` add:

```ts
import { isRelevantTotal } from "./inventory.js";
import { effectiveMainStat } from "./jobs.js";
```

- [ ] **Step 3: renderer.ts — add-character passes mainStat**

In `wireUp`, in the `addChar` click handler, replace the `addCharacter` call:

```ts
    await window.api.addCharacter({
      name,
      job: jobInput.value.trim() || undefined,
      mainStat: $<HTMLSelectElement>("charMainStat").value || undefined,
    });
```

(and after clearing the inputs, also reset the select: `$<HTMLSelectElement>("charMainStat").value = "";`)

- [ ] **Step 4: renderer.ts — filter the roster-list totals**

In `renderRosterList`, replace the `totals` computation:

```ts
    const ms = effectiveMainStat(c);
    const totals = computeTotals(c.equipment)
      .filter((t) => isRelevantTotal(t.key, ms))
      .slice(0, 3)
      .map((t) => `${t.key} ${t.isPercent ? `${t.total}%` : `+${t.total}`}`)
      .join(" · ");
```

- [ ] **Step 5: renderer.ts — item name in slot cells**

In `slotCell`, the filled-cell `innerHTML` gains an item-name line. Replace the filled branch's `cell.innerHTML = ...` with:

```ts
  const pct = potentialPercents(d);
  cell.title = d.name;
  cell.innerHTML =
    `<span class="pd-label">${slotLabel(slot)}</span>` +
    `<span class="pd-item">${escapeHtml(d.name)}</span>` +
    `<span class="pd-star">★${d.starForce ?? 0}</span>` +
    (pct ? `<span class="pd-pot">${escapeHtml(pct)}</span>` : "");
```

- [ ] **Step 6: renderer.ts — filter inventory totals + add the main-stat override**

In `renderInventory`, replace the `totals` computation with the filtered version:

```ts
  const ms = effectiveMainStat(c);
  const totals = computeTotals(c.equipment)
    .filter((t) => isRelevantTotal(t.key, ms))
    .slice(0, 4)
    .map((t) => `${t.key} ${t.isPercent ? `${t.total}%` : `+${t.total}`}`)
    .join(" · ");
```

And after the `title` is appended (after `root.appendChild(title);`), add the override control:

```ts
  const msRow = document.createElement("div");
  msRow.className = "ms-row";
  const msLabel = document.createElement("span");
  msLabel.className = "muted";
  msLabel.textContent = "Main stat:";
  const msSel = document.createElement("select");
  for (const opt of ["", "STR", "DEX", "INT", "LUK"]) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt || "Auto";
    if ((c.mainStat ?? "") === opt) o.selected = true;
    msSel.appendChild(o);
  }
  const msHint = document.createElement("span");
  msHint.className = "muted";
  msHint.textContent = `(${ms ?? "all"})`;
  msSel.onchange = async () => {
    await window.api.updateCharacter({ characterId: c.id, mainStat: msSel.value || undefined });
    await refreshCharacters();
  };
  msRow.append(msLabel, msSel, msHint);
  root.appendChild(msRow);
```

- [ ] **Step 7: Build + test + verify wiring**

Run: `npm run typecheck` → exit 0.
Run: `npm run build` → exit 0. Confirm `dist/renderer/jobs.js` exists and `dist/renderer/renderer.js` contains `from "./jobs.js"`.
Run: `npm test` → all pass (renderer not unit-tested).

- [ ] **Step 8: Commit**

```bash
git add src/renderer/renderer.ts src/renderer/index.html
git commit -m "feat: main-stat selects, filtered totals, item names in slots"
```

---

## Task 6: Verification gate

**Files:** none.

- [ ] **Step 1: Full checks** — `npm run typecheck` (0), `npm run build` (0), `npm test` (all pass).

- [ ] **Step 2: Manual (`npm start`) — needs the user**
- Add a character "Bishop" → inventory totals show INT/MATT/BOSS/DEF, hide STR/DEX/LUK; the header shows "Main stat: Auto (INT)".
- Override Main stat to STR → totals update and persist across a relaunch.
- Slot cells show the item name (truncated, hover shows full); the center summary no longer overflows.
- A Tesseract capture fills base/SF/flame (positional) and potential lines read cleanly (no `=`/`:`/junk).

- [ ] **Step 3: Commit any touch-ups** (only if Step 2 surfaced a fix).

---

## Done criteria

- `npm run typecheck`, `npm run build`, `npm test` all pass.
- Main stat inferred from job + overridable and persisted; totals filtered to relevant stats; slot cells show item names; summary fits; breakdown filled positionally; potential lines cleaned.
- No DB; JSON persistence unchanged.
