# Richer Equipment Model — Design Spec

**Date:** 2026-06-13
**Status:** Approved design, pending implementation plan
**Scope:** Full vertical slice — data model → extraction → store → roster UI → tests

## 1. Context

Maple BossMule captures a MapleStory equipment tooltip via screenshot, OCRs it into
structured data, and stores it per character. Phase 1.5 ships a working pipeline
(`upload → cropToTooltip → OcrEngine.extract → store → display`) with three engines
(stub, Tesseract, vision-LLM) behind one interface.

Running the real AbsoLab Mage Cape sample through the Tesseract pipeline
(`samples/absolab-cape.png`, confidence 0.61) confirmed the plumbing works but exposed
that the current flat `EquipmentData` model cannot represent most of a real tooltip:

- No place for **Star Force**, the **base/flame/starforce breakdown** `(15 +52 +79)`,
  **required job/level**, **set name**, **tradability**, or **category**.
- **Potential lines are mixed into `stats[]`** (e.g. "HP Recovery +30%" was miskeyed as
  Max HP).
- `normalizeStatKey` lacks `DEF`; the name heuristic grabbed the star row; "Required
  Level" leaked in as a fake stat; UI noise ("Combat Power Increase") became fake stats.

This spec deepens the model and the whole stack that produces and consumes it.

## 2. Goals

Support the four things the user tracks across boss mules:

1. **Star Force progress** — reliable per-item star count.
2. **Flame / bonus quality** — the per-source breakdown, with the flame component
   captured specifically.
3. **Potential lines & tier** — kept separate from base stats.
4. **Totals & set completion** — summed stats per character and grouping by set.

## 3. Non-goals (explicit out of scope)

- **Real tooltip cropping** — `cropToTooltip` stays a pass-through.
- **History / diffs** — the store keeps "latest wins" per slot (see §6). History is the
  natural next spec.
- **A set-size reference database** — set completion shows a count per set name
  ("AbsoLab ×3"), not "3/5" (see §8). A static set-size map is a possible later stretch.
- **Full Tesseract parity** — Tesseract is best-effort (see §5.2).

## 4. Key decisions & rationale

| Decision | Choice | Why |
|---|---|---|
| Stat representation | **Enriched keyed list** (extend `StatLine[]`) | Incremental from current shape; flexible to any key; sums easily; maps 1:1 to a vision JSON schema. |
| Engine strategy | **Vision accurate, Tesseract best-effort** | Vision sees color and returns JSON; squeezing reliable breakdown from Tesseract's noisy, colorless text is fragile and low-ROI. |
| Breakdown attribution | **By color, not position** | Components vary in count (`INT +107 (15 +92)` has two); color disambiguates: white=base, **turquoise=flame**, gold=star force. |
| Persistence | **Latest-wins, validated load** | Totals/set-completion work off current state; history is a separate concern. |
| Roster UI | **Hybrid: comparison table overview + detailed card on click-in** | Serves "review across the roster" with depth on demand. |

## 5. Extraction

### 5.1 Data model (`src/shared/types.ts`)

Replaces today's flat `EquipmentData`.

```ts
/** A stat's value decomposed by source. Components are color-keyed in the
 *  tooltip (white=base, turquoise=flame, gold=star force); any may be absent.
 *  Tesseract sets only `total` (color is lost in plain OCR). */
export interface StatBreakdown {
  total: number;        // headline number, e.g. 146
  base?: number;        // white
  flame?: number;       // turquoise — the flame / bonus stat
  starforce?: number;   // gold
}

export interface StatLine {
  key: string;          // STR, DEX, INT, LUK, ALL_STAT, MAX_HP, MAX_MP,
                        // ATT, MATT, DEF, BOSS_DMG, IED, CRIT_DMG, DMG, ... or UNKNOWN
  isPercent: boolean;   // true for lines like "All Stats +5%"
  breakdown: StatBreakdown;
  raw: string;          // exact line, always kept for verification
}

export interface PotentialLine {
  raw: string;          // "INT +13%"
  key?: string;         // normalized if recognizable, else undefined
  value?: string;       // "+13%"
}

export interface EquipmentData {
  name: string;
  category?: string;        // "Cape"
  requiredJob?: string;     // "Magician"
  requiredLevel?: number;   // 160
  set?: string;             // "AbsoLab Set (Magician)"
  tradable?: boolean;       // false when "Untradable" is shown
  starForce?: number;       // 17
  stats: StatLine[];        // base stats, with breakdown
  potential: { tier?: string; lines: PotentialLine[] };  // separate from stats
  confidence?: number;
}
```

This is a **breaking change** to `EquipmentData`; all consumers below are updated to
match.

### 5.2 Vision engine (`src/ocr/visionEngine.ts`) — accurate path

- Update the Zod schema to mirror the new `EquipmentData` (`StatBreakdown`, the separated
  `potential` block, the metadata scalars). Nullable schema fields map to optional type
  fields.
- Rewrite `SYSTEM_PROMPT` to instruct **color-based attribution**: white → `base`,
  turquoise → `flame`, gold → `starforce`; read the lit-star count into `starForce`; pull
  `category` / `requiredJob` / `requiredLevel` / `set`; set `tradable:false` on
  "Untradable"; emit potential lines into `potential.lines`, never into `stats`.

### 5.3 Tesseract (`src/ocr/parse.ts`, `src/ocr/tesseractEngine.ts`) — best-effort

Principle: **fill what's confidently readable, leave the rest empty — never emit wrong
data.**

- Parse each stat's `total`; keep the parenthetical in `raw`; **leave `base/flame/
  starforce` empty** (color is gone, so source attribution would be guessing).
- Fix the observed bugs:
  - **Name:** reject candidate lines that are mostly repeated capital letters / star
    glyphs (the star row) when choosing `name`.
  - Route "Required Level Lv. N" → `requiredLevel` instead of a stat line.
  - Add `DEF` to `normalizeStatKey`.
  - Detect the potential section (header/bullet markers) and route those lines into
    `potential.lines`; do not key them as base stats.
  - Drop UI noise ("Combat Power Increase", "Currently Equipped").
  - Best-effort metadata where regex-detectable: `set`, `tradable` (Untradable),
    `category`, `requiredJob`. `starForce` stays empty unless a textual "N Stars" appears.

### 5.4 Shared normalization (`src/ocr/normalize.ts`, new)

Lift `normalizeStatKey` (plus the new `DEF` key and the percent/potential detection
helpers) into a small shared module used by both `parse.ts` and any vision-side
post-processing, so the key vocabulary stays consistent across engines.

### 5.5 Stub engine (`src/ocr/stubEngine.ts`)

Update the placeholder output to the new shape (populated breakdown, a `potential` block,
metadata) so the plumbing demo stays representative.

## 6. Store (`src/store/store.ts`)

- **Latest-wins retained:** `addEquipment` keeps replacing the entry for a slot.
- **Validated load:** `ensureLoaded` gains a light per-entry shape check; entries that
  don't match the new `EquipmentData` shape are dropped (with a console warning) rather
  than crashing the app. Guards against a stale `tracker.json`.
- No structural change otherwise — the store already persists full `EquipmentData` per
  `EquipmentEntry`.

## 7. Roster UI (`src/renderer/`)

**Hybrid layout:**

- **Overview = comparison table.** One row per equipped item per character; columns for
  ★ Star Force, a small set of key stat totals (main stat, ATT/MATT, DEF — exact column
  set finalized during implementation), and `set`. Per-character **totals row** and a
  **set-completion** cell.
- **Detail on click-in = card.** Clicking a row expands the full
  Total / Base / **Flame** / Star-Force breakdown table plus the `potential` lines.
- **Flame** rendered in a distinct turquoise; Star Force in gold, matching the tooltip.
- The "extracted result" review pane (`showPending`) is updated to render the structured
  fields instead of a raw JSON dump.

The slot is still chosen by the user on save; `category` (e.g. "Cape") may pre-select the
slot dropdown as a convenience (optional nicety, not required).

## 8. Totals & set-completion (`src/renderer/compute.ts`, new — pure functions)

- **Totals:** reduce a character's equipped `EquipmentData[]` by stat `key`, summing
  `breakdown.total`. Flat (`isPercent:false`) and percent (`isPercent:true`) values are
  summed into separate buckets. Defensive: skip stats with no usable total.
- **Set completion:** group equipped items by `set`; display a count per set name
  ("AbsoLab ×3"). A true "X/5" requires a set-size reference (out of scope — see §3).
- Pure functions over `EquipmentData[]`, no Electron/DOM dependency, so they're directly
  unit-testable.

## 9. Error handling

- Vision: missing `ANTHROPIC_API_KEY` and schema-invalid responses surface as clear
  errors (current behavior kept). Unknown stat keys preserved in `raw`.
- Tesseract: never throws on unreadable content; reports `confidence`.
- Store: malformed/stale entries dropped on load, not fatal.
- Compute: defensive against missing breakdowns / missing `set`.

## 10. Testing

The project currently has no tests or test runner.

- Add **`node:test`** (zero new dependencies). Tests are authored in TypeScript under
  `test/`, compiled by `tsc` (tsconfig `include` extended to cover `test/`), and run with
  `node --test` over the compiled output (`dist/test/*.test.js`).
- **`parse.ts` units:** assert the §5.3 fixes against the captured Tesseract output +
  crafted clean inputs — name ≠ star row, level routing, `DEF` key, potential separation,
  `total` parsing, noise dropped.
- **`compute.ts` units:** totals reducer and set-completion grouping over crafted
  `EquipmentData[]`.
- Vision engine remains covered by the manual `scripts/smoke-extract.js` harness (needs
  network + key), not unit tests.
- **Verification gate:** after the parser changes, re-run
  `node scripts/smoke-extract.js samples/absolab-cape.png tesseract` and confirm the four
  bugs are gone; optionally run the vision engine once with a key to confirm full capture.

## 11. Affected files

- `src/shared/types.ts` — new `EquipmentData` / `StatLine` / `StatBreakdown` / `PotentialLine`.
- `src/ocr/visionEngine.ts` — enriched schema + color-aware prompt.
- `src/ocr/parse.ts` — best-effort rich parsing + bug fixes.
- `src/ocr/tesseractEngine.ts` — minor (consumes updated `parse.ts`).
- `src/ocr/normalize.ts` — **new** shared key normalization.
- `src/ocr/stubEngine.ts` — placeholder updated to new shape.
- `src/store/store.ts` — validated load.
- `src/renderer/renderer.ts`, `src/renderer/index.html` — hybrid table + detail card, structured review pane.
- `src/renderer/compute.ts` — **new** totals & set-completion.
- `test/*.test.ts` (or compiled `dist/test/*.test.js`) — **new** unit tests.
- `package.json` — `test` script (`node --test`).

## 12. Open questions

None blocking. The set-size reference (for "X/5") is deferred deliberately.
