# Paper-Doll Inventory + Capture UX — Design Spec

**Date:** 2026-06-14
**Status:** Approved design, pending implementation plan
**Scope:** Renderer-only. Three cohesive features: (1) a per-character paper-doll
equipment inventory, (2) clipboard paste capture, (3) an editable extraction preview. No
model/store/engine changes.

## 1. Context

The roster currently shows each character as a comparison table (Plan 2). This round
reskins it into a per-character paper-doll inventory like the in-game Equipment window, and
improves capture: paste a screenshot with Ctrl+V, and correct OCR mistakes in the preview
before saving. All three are renderer changes that reuse existing code
(`src/renderer/compute.ts` for totals/set-counts, `detailHtml` for the breakdown, the
existing `handleFile`/extract flow). The data model already has everything needed (26
slots, star force, potential lines/tier, the base/flame/starForce breakdown).

## 2. Goals

1. **Per-character paper-doll inventory** — roster lists mules; selecting one opens its
   equipment grid (one at a time). Slots arranged like the equip window, center panel for
   totals/set-counts, slot cells showing ★ + potential % + tier-colored border, click a
   slot for the full breakdown.
2. **Clipboard paste** — pressing Ctrl+V with an image in the clipboard sends it straight
   into the extract flow (drag-drop and file-pick stay).
3. **Editable preview** — every extracted value is editable before saving (OCR is rough):
   name, ★, metadata, each stat's key/total/base/flame/starForce/isPercent, potential
   tier and lines.

## 3. Non-goals (explicit)

- **Item sprites/icons** — deferred to a separate follow-up spec (crop icon pixels from
  the screenshot).
- **Add/remove rows in the editable preview** — only editing existing values this round
  (no inserting/deleting stat or potential lines).
- **No changes** to the data model, store, OCR engines, or parser.
- **Pixel-perfect** game replication — the arrangement approximates it.

## 4. Flow & state

- **Roster (list):** character cards — name, job, "N / 26 geared", a couple headline
  totals (`computeTotals`).
- Selecting a card sets a new renderer state var `selectedCharacterId` → renders that
  character's **inventory view**; a "← Roster" control clears it.
- **Capture:** drag-drop, click-to-pick, OR Ctrl+V → `handleFile(file)` → editable
  preview. Editing updates a working copy; **Save to character** persists the edited data
  to the selected character + slot, then refreshes the current view.

## 5. The inventory grid (finalized layout)

5-column grid, character summary in the center column (spanning rows 1–5), with
weapon/secondary/emblem in a row directly beneath it (row 6):

| Col 1 | Col 2 | Col 3 (center) | Col 4 | Col 5 |
|-------|-------|----------------|-------|-------|
| Ring 1 | Face | *summary* | Hat | Cape |
| Ring 2 | Eye | *(rows 1–5)* | Top | Gloves |
| Ring 3 | Earring | | Bottom | Shoes |
| Ring 4 | Pendant 1 | | Shoulder | Medal |
| Belt | Pendant 2 | | Android | Heart |
| Pocket | **Weapon** | **Secondary** | **Emblem** | Badge |

- Row 6 center (`weapon`, `secondary`, `emblem`) is the row-of-3 under the summary, flanked
  by `pocket` (col 1) and `badge` (col 5).
- `overall` occupies the Top+Bottom area when an item is stored in that slot.
- Encoded as a `SLOT_LAYOUT` constant (5 columns; col 3 = summary rows 1–5 + `secondary` at
  row 6). Every `EquipmentSlot` appears once.
- **Center panel:** name, job, "N / 26 geared", stat totals (`computeTotals`), set counts
  (`computeSetCounts`).
- **Slot cell:** empty → dashed/muted border + slot label. Filled → solid tier-colored
  border, slot label, **★N** (gold), **potential %** (from `potential.lines`). Click →
  toggles the `detailHtml` breakdown (Total/Base/Flame/SF + potential).

## 6. Clipboard paste

- A document-level `paste` listener reads `ClipboardEvent.clipboardData.items`; the first
  `image/*` item is taken as a `File`/`Blob` and passed to the existing `handleFile`.
- If no image is present, the paste is ignored (no error).
- Drag-drop and the file picker remain unchanged. A short hint ("or press Ctrl+V") is added
  to the drop zone text.

## 7. Editable preview

`showPending(data)` becomes an **editable form** bound to a working copy of the extracted
`EquipmentData` (so edits don't mutate the original until saved):

- **Item:** `name` (text), `starForce` (number).
- **Metadata:** `category`, `requiredJob`, `requiredLevel` (number), `set` (text),
  `tradable` (an "Untradable" checkbox — checked → `false`, unchecked → `undefined`; the
  model never sets `true`), `potential.tier` (select: none / Rare / Epic / Unique /
  Legendary).
- **Stats** — one editable row per `StatLine`: `key` (text), `isPercent` (checkbox),
  `breakdown.total`, `breakdown.base`, `breakdown.flame`, `breakdown.starForce` (number
  inputs; blank → `undefined` for the optional sub-fields).
- **Potential lines** — one editable row per `PotentialLine`: `raw` (text), `value` (text),
  `key` (text).
- Inputs write back into the working copy (on input or read-on-save). **Save to character**
  persists the working copy via the existing `addEquipment`.
- Number coercion uses a small pure helper `toNum(value): number | undefined` (blank/NaN →
  `undefined`; used for optional fields) and a required-total variant.
- No add/remove of rows this round (per non-goals).

## 8. New pure helpers (testable)

In a new `src/renderer/inventory.ts` (keeps `compute.ts` focused on aggregation):

```ts
export function tierColor(tier: string | undefined): string;
export function potentialPercents(data: EquipmentData): string;
export function toNum(value: string): number | undefined;
```
- `tierColor`: Rare=blue, Epic=purple, Unique=gold, Legendary=green (case-insensitive);
  unknown/undefined → a neutral border color. (Note: corrects the brainstorming mockup,
  which had Unique as purple.)
- `potentialPercents`: compact "+13% +10%" of the percent tokens in `potential.lines`; ""
  when none.
- `toNum`: trims input; empty or non-numeric → `undefined`; else the parsed number.
- `SLOT_LAYOUT` constant (the §5 arrangement) also lives here.

## 9. Affected files

- `src/renderer/renderer.ts` — roster list → inventory grid → slot detail (reuse
  `detailHtml`/`computeTotals`/`computeSetCounts`); add `selectedCharacterId`; the `paste`
  listener; the editable `showPending` form + save-reads-working-copy. Helpers
  (`renderRosterList`, `renderInventory`, `renderSlotCell`, `renderEditablePreview`).
- `src/renderer/inventory.ts` — **new**: `tierColor`, `potentialPercents`, `toNum`,
  `SLOT_LAYOUT`. (Value-imported by `renderer.ts` with the `.js` extension per Plan 2's
  ESM note.)
- `src/renderer/index.html` — CSS for the grid, slot cells, tier colors, center panel,
  roster list, and the editable form; add the "or press Ctrl+V" hint.
- `test/inventory.test.ts` — **new**: unit tests for `tierColor`, `potentialPercents`,
  `toNum`.

## 10. Testing

- **Unit (`node:test`):** `tierColor` (each tier → expected color; unknown → neutral),
  `potentialPercents` (lines with % → joined; none → ""), `toNum` (blank/NaN → undefined;
  "17" → 17; " 5 " → 5).
- **Build:** `npm run build` + `npm run typecheck` green; renderer value imports keep `.js`.
- **Manual (`npm start`):** roster list → open character → grid (filled/empty, tier
  borders, ★, potential %) → click slot → breakdown; Ctrl+V an image → preview appears;
  edit a value (incl. a breakdown number) → Save → reopen → edited value persisted.

## 11. Open questions

None. Sprites and row add/remove are deliberately separate follow-ups.
