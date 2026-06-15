# Class-Aware Roster + Readability — Design Spec

**Date:** 2026-06-14
**Status:** Approved design, pending implementation plan
**Scope:** A character "main stat" (inferred from job, overridable), a relevant-stat filter for the roster/inventory totals, item names in slot cells, a summary-overflow fix, and best-effort positional base/SF/flame parsing for Tesseract.

## 1. Context

Feedback while using the paper-doll inventory:
- For a mage, off-stats (STR/DEX/LUK) clutter the view — only the main stat (and power stats) matter.
- Slot cells don't show *which item* is equipped.
- The center summary panel overflows its column.
- Tesseract leaves base/flame/SF empty.

All renderer-side except a small `Character.mainStat` field (+ store/IPC to persist the override) and a `parse.ts` change. Persistence stays JSON.

## 2. Goals

1. **Main stat per character** — inferred from the job text, with a manual override.
2. **Relevant-stat filter** — the roster/inventory **totals** hide off-main base stats; the per-item detail view still shows everything.
3. **Item name in each slot cell** — see what's equipped at a glance.
4. **Fix the center summary overflow.**
5. **Best-effort positional breakdown** — Tesseract fills base/SF/flame from the parenthetical numbers (editable).

## 3. Non-goals

- Reliable name OCR (parked — Tesseract can't read the stylized name; the editable field is the workaround).
- Color-accurate breakdown attribution from Tesseract (needs Vision); positional is explicitly best-effort.
- No model changes beyond `Character.mainStat`; no DB.

## 4. Main stat (infer + override)

- **`jobToMainStat(job: string | undefined): "STR" | "DEX" | "INT" | "LUK" | undefined`** (pure, in a new `src/renderer/jobs.ts`). Case-insensitive keyword match:
  - **INT:** magician, mage, wizard, bishop, arch mage, fire, poison, ice, lightning, evan, luminous, battle mage, kanna, illium, kinesis, lara, beast tamer.
  - **STR:** warrior, hero, paladin, dark knight, dawn warrior, aran, kaiser, hayato, blaster, demon slayer, demon avenger, mihile, zero, adele.
  - **DEX:** archer, bowman, hunter, ranger, marksman, sniper, pathfinder, wind archer, mercedes, wild hunter, kain.
  - **LUK:** thief, rogue, assassin, bandit, night lord, shadower, dual blade, night walker, phantom, cadena, hoyoung.
  - No match → `undefined`.
- **`Character.mainStat?: string`** — explicit override (one of STR/DEX/INT/LUK). Absent → infer.
- **`effectiveMainStat(c: Character): string | undefined` = `c.mainStat ?? jobToMainStat(c.job)`** — `undefined` when the job isn't recognized and there's no override (the filter then shows all stats, so an unknown class isn't wrongly stripped).
- **Persistence:** new store method `updateCharacter(id, patch: Partial<Pick<Character, "mainStat">>)` + IPC channel `store:updateCharacter` + handler. (Generic patch so future per-character fields reuse it.)
- **UI:**
  - Add-character form gains a **Main stat** `<select>` (Auto / STR / DEX / INT / LUK), default Auto. `AddCharacterRequest` gains `mainStat?`.
  - The inventory view header shows **"Main: ▾"** (Auto + 4 stats) reflecting the effective stat; changing it calls `updateCharacter` and re-renders.

## 5. Relevant-stat filter

- **`isRelevantTotal(key: string, mainStat: string | undefined): boolean`** (pure, in `src/renderer/inventory.ts`):
  - `UNKNOWN` → false; `MAX_MP` → false.
  - If `mainStat` is `undefined` → true for everything else (no off-stat hiding for unknown classes).
  - Otherwise a primary stat (`STR`/`DEX`/`INT`/`LUK`) that is **not** `mainStat` → false.
  - Everything else (mainStat, `ALL_STAT`, `ATT`, `MATT`, `DEF`, `MAX_HP`, `BOSS_DMG`, `IED`, `CRIT_DMG`, `CRIT_RATE`, `DMG`) → true.
- Applied to the **totals** in the center summary panel and the roster-list card (filter `computeTotals` output by `isRelevantTotal(t.key, effectiveMainStat(c))`).
- The click-into **item detail** breakdown table is unchanged (shows all of that item's stats).

## 6. Item name in slot cells

- A filled cell renders, top-to-bottom: **slot label**, **item name** (truncated with ellipsis; `title` attribute = full name for hover), **★N**, **potential %**.
- CSS: name line `overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%`.

## 7. Summary overflow fix

- `.pd-summary`: `min-width: 0; overflow: hidden;` and its text lines get `overflow-wrap: anywhere` (or `word-break: break-word`) so long totals wrap instead of spilling. With the §5 filter the totals are short, but the wrap is the real fix. Reduce the totals font slightly if needed.

## 8. Best-effort positional breakdown (parse.ts)

- For each base stat line, after the total, parse the parenthetical group's numbers **in order**: index 0 → `base`, index 1 → `starForce`, index 2 → `flame`.
  - 3 numbers `(15 +52 +79)` → base 15, starForce 52, flame 79.
  - 2 numbers `(15 +92)` → base 15, starForce 92 (flame undefined).
  - 1 / none → base only (or leave breakdown to just `total`).
- New helper `parseParenBreakdown(line): { base?; starForce?; flame? }` used in the stat-line path; merged into the existing `breakdown` (which keeps `total`). Best-effort and editable — the order may mislabel some 2-number lines.

## 9. Affected files

- `src/renderer/jobs.ts` — **new**: `jobToMainStat`, `effectiveMainStat`.
- `src/renderer/inventory.ts` — add `isRelevantTotal`.
- `src/shared/types.ts` — `Character.mainStat?`.
- `src/shared/ipc.ts` — `updateCharacter` channel + `UpdateCharacterRequest`; `AddCharacterRequest.mainStat?`; `TrackerApi.updateCharacter`.
- `src/store/store.ts` — `updateCharacter`; `addCharacter` accepts `mainStat`.
- `src/main/ipc.ts`, `src/main/preload.ts` — wire `updateCharacter`.
- `src/ocr/parse.ts` — `parseParenBreakdown` (base/SF/flame positional).
- `src/renderer/renderer.ts` — main-stat dropdowns (add form + inventory header), filtered totals, item name in cells.
- `src/renderer/index.html` — CSS for name ellipsis + summary wrap; Main-stat select on the add form.
- `test/jobs.test.ts`, `test/inventory.test.ts`, `test/parse.test.ts` — units.

## 10. Testing

- **Unit (`node:test`):**
  - `jobToMainStat` (mage→INT, bishop→INT, hero→STR, marksman→DEX, shadower→LUK, "" → undefined); `effectiveMainStat` (override wins; infer from job; undefined for an unrecognized job + no override).
  - `isRelevantTotal` (mage hides STR/DEX/LUK + MAX_MP + UNKNOWN; keeps INT, MATT, BOSS_DMG, DEF, ALL_STAT; undefined mainStat → keeps all real stats).
  - `parseParenBreakdown` ("(15 +52 +79)" → base15/sf52/flame79; "(15 +92)" → base15/sf92; "(250 +395)" → base250/sf395; no parens → empty).
- **Build:** typecheck + build green; renderer value imports keep `.js`.
- **Manual:** add a "Mage" → main stat auto INT; inventory totals show INT/MATT/BOSS/DEF, hide STR/DEX/LUK; override to STR → updates + persists; slot cells show item names (truncated, hover for full); summary no longer overflows; a Tesseract capture fills base/SF/flame positionally (editable).

## 11. Open questions

None.
