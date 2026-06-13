# Rich Equipment Model & Extraction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `EquipmentData` with a rich model (Star Force, per-source stat breakdown, job/level/set/category/tradable, separated potential lines) and update the extraction layer — vision fully, Tesseract best-effort — plus a validated store load, keeping the app building and adding unit tests.

**Architecture:** Extend the keyed stat list with a `StatBreakdown` (`total`/`base`/`flame`/`starforce`); lift stat-key normalization into a shared module; enrich the vision Zod schema with a color-aware prompt; rewrite the Tesseract heuristic parser to fill what it can and route metadata/potential correctly; validate store loads. Pure logic (normalize, parse) is covered by `node:test`.

**Tech Stack:** TypeScript 5.4, Electron 29, `@anthropic-ai/sdk` + `zod` (vision), `tesseract.js`, `node:test`.

**Companion plan:** UI + aggregation (`compute.ts`, hybrid roster table/detail card) is **Plan 2**, written after this plan is executed and verified.

**Source of truth:** `docs/superpowers/specs/2026-06-13-richer-equipment-model-design.md`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `tsconfig.test.json` | Compile `src/` + `test/` to `.test-build/` for `node:test` | Create |
| `test/sanity.test.ts` | Prove the test runner works | Create |
| `test/normalize.test.ts` | Unit tests for stat-key normalization | Create |
| `test/parse.test.ts` | Unit tests for the Tesseract parser | Create |
| `test/store.test.ts` | Unit tests for store load validation | Create |
| `src/ocr/normalize.ts` | Shared stat-key normalization | Create |
| `src/shared/types.ts` | New `EquipmentData` / `StatLine` / `StatBreakdown` / `PotentialLine` | Modify |
| `src/ocr/visionEngine.ts` | Enriched schema + color-aware prompt | Modify |
| `src/ocr/stubEngine.ts` | Placeholder output in new shape | Modify |
| `src/ocr/parse.ts` | Best-effort rich parsing + bug fixes | Modify (rewrite) |
| `src/store/store.ts` | Validated load | Modify |
| `src/renderer/renderer.ts` | Minimal compile keep-alive (field renames) | Modify |
| `package.json` | `test` script | Modify |
| `.gitignore` | Ignore `.test-build/` | Modify |

---

## Task 1: Test infrastructure (node:test)

**Files:**
- Create: `tsconfig.test.json`
- Create: `test/sanity.test.ts`
- Modify: `package.json` (scripts)
- Modify: `.gitignore`

- [ ] **Step 1: Create `tsconfig.test.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": ".test-build",
    "sourceMap": false
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

This compiles `src/` and `test/` together to `.test-build/` (preserving relative paths, so `test/x.test.ts` → `.test-build/test/x.test.js` importing from `../src/...` → `.test-build/src/...`). The production build (`tsconfig.json` → `dist/`) is untouched. The inherited `exclude` keeps `src/renderer/renderer.ts` out of the test build.

- [ ] **Step 2: Ignore the test build dir**

Add to `.gitignore` (after the existing `*.traineddata` line):

```
.test-build/
```

- [ ] **Step 3: Add the `test` script to `package.json`**

In `"scripts"`, add:

```json
"test": "tsc -p tsconfig.test.json && node --test .test-build/test"
```

- [ ] **Step 4: Write the sanity test**

`test/sanity.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("test runner works", () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: compiles, then `node --test` prints `tests 1` / `pass 1` / `fail 0`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add tsconfig.test.json test/sanity.test.ts package.json .gitignore
git commit -m "test: add node:test infrastructure"
```

---

## Task 2: Shared stat-key normalization

**Files:**
- Create: `src/ocr/normalize.ts`
- Test: `test/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

`test/normalize.test.ts`:

```ts
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

test("normalizeStatKey returns UNKNOWN for unrecognized labels", () => {
  assert.equal(normalizeStatKey("Combat Power"), "UNKNOWN");
  assert.equal(normalizeStatKey(""), "UNKNOWN");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/ocr/normalize'`.

- [ ] **Step 3: Implement `src/ocr/normalize.ts`**

```ts
// Shared stat-key vocabulary, used by both the Tesseract parser and any
// vision-side post-processing so engines agree on keys. Order matters:
// more specific patterns (Magic ATT) are tested before broader ones (ATT).

/** Normalize a raw stat label to a stable key, or "UNKNOWN" if unrecognized. */
export function normalizeStatKey(label: string): string {
  const l = label.toLowerCase();
  if (/all\s*stat/.test(l)) return "ALL_STAT";
  if (/\bstr\b|strength/.test(l)) return "STR";
  if (/\bdex\b|dexterity/.test(l)) return "DEX";
  if (/\bint\b|intelligence/.test(l)) return "INT";
  if (/\bluk\b|luck/.test(l)) return "LUK";
  if (/magic\s*att|\bmatt\b|m\.?\s*att/.test(l)) return "MATT";
  if (/a[lt]tack\s*power|weapon\s*att|\batt\b|attack/.test(l)) return "ATT";
  if (/defen[sc]e|\bdef\b/.test(l)) return "DEF";
  if (/boss/.test(l)) return "BOSS_DMG";
  if (/ignore|\bied\b/.test(l)) return "IED";
  if (/crit.*dmg|critical\s*damage/.test(l)) return "CRIT_DMG";
  if (/crit/.test(l)) return "CRIT_RATE";
  if (/max\s*hp|\bhp\b/.test(l)) return "MAX_HP";
  if (/max\s*mp|\bmp\b/.test(l)) return "MAX_MP";
  if (/damage|dmg/.test(l)) return "DMG";
  return "UNKNOWN";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all `normalizeStatKey` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/ocr/normalize.ts test/normalize.test.ts
git commit -m "feat: shared stat-key normalization with DEF + OCR tolerance"
```

---

## Task 3: New data model + migrate consumers to compile

This is a coordinated breaking change. Each step is one file; the build is verified green at the end.

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/ocr/visionEngine.ts`
- Modify: `src/ocr/stubEngine.ts`
- Modify: `src/ocr/parse.ts` (temporary compiling stub; real impl in Task 4)
- Modify: `src/renderer/renderer.ts`

- [ ] **Step 1: Rewrite the model in `src/shared/types.ts`**

Replace the `StatLine` and `EquipmentData` interfaces (lines 3–25) with:

```ts
/** A stat's value decomposed by source. Components are color-keyed in the
 *  tooltip (white=base, turquoise=flame, gold=star force); any may be absent.
 *  Plain OCR (Tesseract) loses color, so it sets only `total`. */
export interface StatBreakdown {
  /** The headline number, e.g. 146. */
  total: number;
  /** White component — the item's base stat. */
  base?: number;
  /** Turquoise component — the flame / bonus stat. */
  flame?: number;
  /** Gold component — star force enhancement. */
  starforce?: number;
}

/** A single stat line read from an equipment tooltip. */
export interface StatLine {
  /** Normalized stat key, e.g. "STR", "MATT", "DEF". Unknown lines use "UNKNOWN". */
  key: string;
  /** True for percent lines like "All Stats +5%". */
  isPercent: boolean;
  /** The value decomposed by source. */
  breakdown: StatBreakdown;
  /** The full raw text of the line, kept for debugging/verification. */
  raw: string;
}

/** A single potential line, kept separate from base stats. */
export interface PotentialLine {
  /** The full raw text, e.g. "INT +13%". */
  raw: string;
  /** Normalized key if recognizable, else undefined. */
  key?: string;
  /** The value as shown, e.g. "+13%". */
  value?: string;
}

/** Structured data extracted from one equipment tooltip screenshot. */
export interface EquipmentData {
  /** Item name as read from the tooltip. */
  name: string;
  /** Item category, e.g. "Cape". */
  category?: string;
  /** Required job, e.g. "Magician". */
  requiredJob?: string;
  /** Required level, e.g. 160. */
  requiredLevel?: number;
  /** Set name, e.g. "AbsoLab Set (Magician)". */
  set?: string;
  /** False when the tooltip shows "Untradable". */
  tradable?: boolean;
  /** Star-force count, if detected. */
  starForce?: number;
  /** Parsed base stat lines. */
  stats: StatLine[];
  /** Potential tier + lines, kept separate from base stats. */
  potential: { tier?: string; lines: PotentialLine[] };
  /** Confidence 0..1 reported by the engine, if available. */
  confidence?: number;
}
```

Leave `EquipmentSlot`, `EquipmentEntry`, `Character`, and `TrackerState` unchanged.

- [ ] **Step 2: Update the vision engine schema + prompt in `src/ocr/visionEngine.ts`**

Replace `EquipmentSchema` (lines 10–35), `SYSTEM_PROMPT` (lines 37–42), and the return mapping (lines 110–118) with:

```ts
const EquipmentSchema = z.object({
  name: z.string().describe("The item name exactly as shown."),
  category: z.string().nullable().describe("Item category, e.g. Cape, or null."),
  requiredJob: z.string().nullable().describe("Required job, e.g. Magician, or null."),
  requiredLevel: z.number().nullable().describe("Required level, e.g. 160, or null."),
  set: z.string().nullable().describe("Set name, e.g. 'AbsoLab Set (Magician)', or null."),
  tradable: z.boolean().nullable().describe("false if 'Untradable' is shown, else null."),
  starForce: z.number().nullable().describe("Lit star-force count, or null."),
  stats: z
    .array(
      z.object({
        key: z.string().describe("Normalized key: STR, DEX, INT, LUK, ALL_STAT, MAX_HP, MAX_MP, ATT, MATT, DEF, BOSS_DMG, IED, CRIT_DMG, DMG; UNKNOWN if unclear."),
        isPercent: z.boolean().describe("true for percent lines like 'All Stats +5%'."),
        breakdown: z.object({
          total: z.number().describe("The headline total, e.g. 146."),
          base: z.number().nullable().describe("White component (base), or null."),
          flame: z.number().nullable().describe("TURQUOISE component (flame/bonus stat), or null."),
          starforce: z.number().nullable().describe("Gold component (star force), or null."),
        }),
        raw: z.string().describe("The full raw stat line."),
      }),
    )
    .describe("Base stat lines only — NOT potential lines."),
  potential: z.object({
    tier: z.string().nullable().describe("Legendary / Unique / Epic / Rare, or null."),
    lines: z
      .array(
        z.object({
          raw: z.string().describe("Full raw potential line, e.g. 'INT +13%'."),
          key: z.string().nullable().describe("Normalized key if recognizable, else null."),
          value: z.string().nullable().describe("Value as shown, e.g. '+13%', or null."),
        }),
      )
      .describe("Potential lines, kept separate from base stats."),
  }),
  confidence: z.number().nullable().describe("Your confidence 0..1."),
});

const SYSTEM_PROMPT = `You read MapleStory equipment tooltips from a screenshot and return structured data.
- Transcribe the item name exactly. Read category, required job, required level, and set name if shown. Set tradable=false only if "Untradable" appears.
- Read the lit star-force count (the row of stars above the name) into starForce.
- Each stat line shows a total and a parenthetical breakdown decomposed BY COLOR, not position:
  - WHITE number = base
  - TURQUOISE / cyan number = flame (bonus stat)
  - GOLD / yellow number = star force
  Attribute each component by its color. A line may have only some components (e.g. "INT +107 (15 +92)").
- Normalize each stat key (STR, DEX, INT, LUK, ALL_STAT, MAX_HP, MAX_MP, ATT, MATT, DEF, BOSS_DMG, IED, CRIT_DMG, DMG; UNKNOWN if unclear). Set isPercent true for % lines.
- Put POTENTIAL lines (the colored lines under the Potential heading) into potential.lines, NEVER into stats. Read the potential tier.
- Numbers matter: do not guess. If a digit is ambiguous, prefer what is most visually supported and lower your confidence.`;
```

And replace the return mapping (the `return { ... }` at the end of `extract`) with:

```ts
    return {
      name: parsed.name,
      category: parsed.category ?? undefined,
      requiredJob: parsed.requiredJob ?? undefined,
      requiredLevel: parsed.requiredLevel ?? undefined,
      set: parsed.set ?? undefined,
      tradable: parsed.tradable ?? undefined,
      starForce: parsed.starForce ?? undefined,
      stats: parsed.stats.map((s) => ({
        key: s.key,
        isPercent: s.isPercent,
        breakdown: {
          total: s.breakdown.total,
          base: s.breakdown.base ?? undefined,
          flame: s.breakdown.flame ?? undefined,
          starforce: s.breakdown.starforce ?? undefined,
        },
        raw: s.raw,
      })),
      potential: {
        tier: parsed.potential.tier ?? undefined,
        lines: parsed.potential.lines.map((p) => ({
          raw: p.raw,
          key: p.key ?? undefined,
          value: p.value ?? undefined,
        })),
      },
      confidence: parsed.confidence ?? undefined,
    };
```

- [ ] **Step 3: Update the stub engine in `src/ocr/stubEngine.ts`**

Replace the `return { ... }` in `extract` (lines 18–29) with:

```ts
    return {
      name: "Arcane Umbra Weapon (stub)",
      category: "Weapon",
      requiredJob: "Magician",
      requiredLevel: 200,
      set: "Arcane Umbra Set",
      tradable: false,
      starForce: 17,
      stats: [
        { key: "INT", isPercent: false, breakdown: { total: 255, base: 100, flame: 90, starforce: 65 }, raw: "INT +255 (100 +90 +65)" },
        { key: "MATT", isPercent: false, breakdown: { total: 197, base: 150, flame: 42, starforce: 5 }, raw: "Magic ATT +197 (150 +42 +5)" },
        { key: "UNKNOWN", isPercent: false, breakdown: { total: kb }, raw: `received ${kb}KB image` },
      ],
      potential: {
        tier: "Legendary",
        lines: [
          { raw: "INT +13%", key: "INT", value: "+13%" },
          { raw: "Boss Damage +35%", key: "BOSS_DMG", value: "+35%" },
        ],
      },
      confidence: 0,
    };
```

- [ ] **Step 4: Replace `src/ocr/parse.ts` with a temporary compiling stub**

Full file contents (the real parser lands in Task 4):

```ts
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
```

(`tesseractEngine.ts` needs no change — it spreads `parseTooltipText(text)` and overrides `confidence`, which still type-checks.)

- [ ] **Step 5: Minimal field-rename in `src/renderer/renderer.ts`**

In `renderRoster`, update the two renamed fields (around lines 86–87):

```ts
        const sf = entry.data.starForce != null ? `★${entry.data.starForce} ` : "";
        const tier = entry.data.potential.tier ? ` [${entry.data.potential.tier}]` : "";
```

(`entry.data.stats.map((s) => s.raw)` on the next line is unchanged — `raw` still exists. The full hybrid UI is Plan 2.)

- [ ] **Step 6: Verify the whole project compiles and tests still pass**

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run build`
Expected: exit 0, `dist/` regenerated.

Run: `npm test`
Expected: PASS (sanity + normalize tests).

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/ocr/visionEngine.ts src/ocr/stubEngine.ts src/ocr/parse.ts src/renderer/renderer.ts
git commit -m "feat: rich EquipmentData model + migrate engines/renderer"
```

---

## Task 4: Real Tesseract parser (best-effort)

**Files:**
- Modify: `src/ocr/parse.ts` (replace the Task 3 stub)
- Test: `test/parse.test.ts`

- [ ] **Step 1: Write the failing tests**

`test/parse.test.ts`:

```ts
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

test("stat totals parse; percent flag set; breakdown sources left empty", () => {
  const d = parseTooltipText(NOISY);
  const str = d.stats.find((s) => s.key === "STR");
  assert.equal(str.breakdown.total, 145);
  assert.equal(str.isPercent, false);
  assert.equal(str.breakdown.flame, undefined); // color unavailable to Tesseract
  const all = d.stats.find((s) => s.key === "ALL_STAT");
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — the Task 3 stub returns `name:"Unknown item"`, empty stats, etc.

- [ ] **Step 3: Implement the real parser in `src/ocr/parse.ts`**

Full file contents:

```ts
import type {
  EquipmentData,
  StatLine,
  PotentialLine,
} from "../shared/types";
import { normalizeStatKey } from "./normalize";

const TIER_RE = /\b(Legendary|Unique|Epic|Rare)\b/i;
const NOISE_RE =
  /combat power|currently equipped|item description|interact|harvest|^untradable$/i;
const LEVEL_RE = /required\s*level\s*l[vy]\.?\s*(\d+)/i;
const JOB_RE = /required\s*job\s*([A-Za-z ]+)/i;
const SET_RE = /([A-Za-z][A-Za-z ]*\bset\b[^\n]*)/i;
const STARS_RE = /(\d+)\s*stars?\b/i;
const POT_MARKER_RE = /^\s*[=•·*\-]\s+/;

/** A line that is mostly uppercase letters with no lowercase/digits is almost
 *  certainly the star-force glyph row OCR'd as letters (e.g. "KAREE AAARE"). */
function looksLikeStarRow(line: string): boolean {
  const letters = line.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4) return false;
  if (/\d/.test(line)) return false;
  return !/[a-z]/.test(letters); // all-caps glyph soup
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Parse the leading number after a stat label, e.g. "+5% (0% +5%)" -> {5,true}. */
function parseLeadingValue(
  rest: string,
): { total: number; isPercent: boolean } | null {
  const m = rest.match(/([+-]?\d[\d,]*)\s*(%?)/);
  if (!m) return null;
  const total = parseInt(m[1].replace(/,/g, ""), 10);
  if (Number.isNaN(total)) return null;
  return { total, isPercent: m[2] === "%" };
}

export function parseTooltipText(text: string): EquipmentData {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let requiredLevel: number | undefined;
  let requiredJob: string | undefined;
  let set: string | undefined;
  let tradable: boolean | undefined;
  let starForce: number | undefined;

  // Metadata pre-scan.
  for (const line of lines) {
    if (/untradable/i.test(line)) tradable = false;
    const lvl = line.match(LEVEL_RE);
    if (lvl) requiredLevel = parseInt(lvl[1], 10);
    const job = line.match(JOB_RE);
    if (job && !requiredJob) requiredJob = job[1].trim();
    if (!set && /\bset\b/i.test(line) && !/set\s*effect\s*$/i.test(line)) {
      const sm = line.match(SET_RE);
      if (sm) set = sm[1].trim();
    }
    const sf = line.match(STARS_RE);
    if (sf && !starForce) starForce = parseInt(sf[1], 10);
  }

  // Potential tier (only when "potential" context exists).
  let tier: string | undefined;
  if (/potential/i.test(text)) {
    const tm = text.match(TIER_RE);
    if (tm) tier = cap(tm[1]);
  }

  // Name: first line that is not the star row, noise, metadata, a marker, or a stat.
  const name =
    lines.find(
      (l) =>
        /[A-Za-z]/.test(l) &&
        !looksLikeStarRow(l) &&
        !NOISE_RE.test(l) &&
        !LEVEL_RE.test(l) &&
        !/required|untradable|set\s*effect|potential/i.test(l) &&
        !POT_MARKER_RE.test(l) &&
        !/[+\-]\s*\d/.test(l),
    ) ?? "Unknown item";

  const stats: StatLine[] = [];
  const potentialLines: PotentialLine[] = [];
  let inPotential = false;

  for (const line of lines) {
    if (/potential/i.test(line)) {
      inPotential = true;
      continue; // the "Potential : Legendary" header itself isn't a line
    }
    if (line === name) continue;
    if (looksLikeStarRow(line)) continue;
    if (NOISE_RE.test(line)) continue;
    if (LEVEL_RE.test(line) || JOB_RE.test(line) || /set\s*effect/i.test(line)) {
      continue;
    }

    const isPotential = inPotential || POT_MARKER_RE.test(line);
    const clean = line.replace(POT_MARKER_RE, "");
    const valIdx = clean.search(/[+\-]?\s*\d/);

    if (valIdx < 0) {
      if (isPotential) potentialLines.push({ raw: line });
      continue;
    }

    const label = clean.slice(0, valIdx).replace(/[:：]/g, "").trim();
    const rest = clean.slice(valIdx);
    const parsed = parseLeadingValue(rest);

    if (!parsed) {
      if (isPotential) potentialLines.push({ raw: line });
      continue;
    }

    if (isPotential) {
      potentialLines.push({
        raw: line,
        key: label ? normalizeStatKey(label) : undefined,
        value: rest.replace(/\s+/g, "").replace(/\(.*$/, "") || undefined,
      });
    } else {
      stats.push({
        key: normalizeStatKey(label || line),
        isPercent: parsed.isPercent,
        breakdown: { total: parsed.total }, // color unavailable -> no base/flame/sf
        raw: line,
      });
    }
  }

  return {
    name,
    requiredLevel,
    requiredJob,
    set,
    tradable,
    starForce,
    stats,
    potential: { tier, lines: potentialLines },
    confidence: undefined,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all `parse.test.ts` cases green (plus sanity + normalize).

- [ ] **Step 5: Commit**

```bash
git add src/ocr/parse.ts test/parse.test.ts
git commit -m "feat: best-effort rich Tesseract parser with bug fixes"
```

---

## Task 5: Store load validation

**Files:**
- Modify: `src/store/store.ts`
- Test: `test/store.test.ts`

- [ ] **Step 1: Write the failing test**

`test/store.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — the stale "cape" entry is currently kept (no validation), so `slots` is `["cape","hat"]`.

- [ ] **Step 3: Add validation to `src/store/store.ts`**

Add this helper above the `Store` class:

```ts
/** A stored entry is valid only if its data matches the current EquipmentData
 *  shape (stats array + potential.lines array). Older flat-shaped entries are
 *  dropped on load so a stale tracker.json can't crash the app. */
function isValidEntry(entry: unknown): entry is EquipmentEntry {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as Record<string, unknown>;
  const d = e.data as Record<string, unknown> | undefined;
  if (!d || typeof d !== "object") return false;
  if (typeof d.name !== "string") return false;
  if (!Array.isArray(d.stats)) return false;
  const pot = d.potential as Record<string, unknown> | undefined;
  if (!pot || !Array.isArray(pot.lines)) return false;
  return typeof e.slot === "string";
}
```

Then in `ensureLoaded`, after `this.state = JSON.parse(raw) as TrackerState;` and the `characters` array check, normalize each character's equipment:

```ts
      for (const c of this.state.characters) {
        if (!Array.isArray(c.equipment)) {
          c.equipment = [];
          continue;
        }
        const before = c.equipment.length;
        c.equipment = c.equipment.filter(isValidEntry);
        const dropped = before - c.equipment.length;
        if (dropped > 0) {
          console.warn(`Store: dropped ${dropped} stale equipment entr${dropped === 1 ? "y" : "ies"} for ${c.name}`);
        }
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — `slots` is `["hat"]`; all suites green.

- [ ] **Step 5: Commit**

```bash
git add src/store/store.ts test/store.test.ts
git commit -m "feat: validate equipment entries on store load"
```

---

## Task 6: Verification gate

**Files:** none (verification only)

- [ ] **Step 1: Rebuild**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 2: Re-run the Tesseract smoke on the real sample**

Run: `node scripts/smoke-extract.js samples/absolab-cape.png tesseract`
Expected, in the printed JSON:
- `name` is **not** the star-glyph row (should be the item name line, not `"KAREE AAARE RAAAR"`).
- `requiredLevel` is `160` and there is no stat whose `raw` contains "Required Level".
- a stat with `key: "DEF"` and `breakdown.total: 645` exists.
- `potential.lines` contains the three Legendary lines; no `stats[]` entry contains "Recovery".
- `tradable` is `false`.

- [ ] **Step 3: (Optional) Vision parity check**

If an `ANTHROPIC_API_KEY` is available:
Run: `setx ANTHROPIC_API_KEY "sk-ant-..."` (new shell), then
`node scripts/smoke-extract.js samples/absolab-cape.png vision-llm`
Expected: `starForce: 17`, populated `breakdown.flame` values (turquoise components), `set`, `requiredJob: "Magician"`, potential lines separated.

- [ ] **Step 4: Full test run**

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 5: Commit any sample/harness artifacts (optional)**

If you want the sample + smoke harness tracked:

```bash
git add samples/absolab-cape.png scripts/smoke-extract.js
git commit -m "test: track AbsoLab sample + smoke harness"
```

---

## Done criteria

- `npm run build`, `npm run typecheck`, and `npm test` all pass.
- The Tesseract smoke on `samples/absolab-cape.png` shows the four fixed bugs (name, level, DEF, potential separation) plus `tradable:false`.
- The app still launches and the roster renders (minimal renderer); the **hybrid UI + totals/set-completion are Plan 2**.
