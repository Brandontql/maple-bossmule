# Paper-Doll Equipment Inventory — Design Spec

**Date:** 2026-06-14
**Status:** Approved design, pending implementation plan
**Scope:** Renderer-only UI redesign. No model/store/engine changes.

## 1. Context

The roster currently shows each character as a comparison table (Plan 2). The user wants
the gear presented like the in-game **Equipment** window: a per-character paper-doll grid
of equipment slots. This reuses what Plan 2 already built — `src/renderer/compute.ts`
(`computeTotals`, `computeSetCounts`) and the breakdown renderer (`detailHtml`) — and
touches only the renderer and its HTML/CSS.

## 2. Goals

- A **per-character inventory view**: the roster lists mules; selecting one opens its
  paper-doll equipment grid (one character at a time), like opening the equip window.
- Slots arranged to approximate the in-game equip window, with a center panel (standing in
  for the avatar) showing the character's totals and set counts.
- Each filled slot cell shows, at a glance: **★ star-force count**, **potential %**, and a
  **potential-tier-colored border**. Clicking a slot expands its full
  Total/Base/Flame/SF breakdown + potential lines.

## 3. Non-goals (explicit)

- **Item sprites/icons** — deferred to a separate follow-up spec. (OCR can't read sprites;
  a later spec will crop the icon pixels from the tooltip screenshot. Out of scope here.)
- **No changes** to the data model, store, OCR engines, or parser. All needed data
  (slots, star force, potential lines/tier) already exists.
- **Pixel-perfect** replication of the game window. The arrangement approximates it; exact
  positions are tunable but not a hard requirement.

## 4. Flow & state

- **Roster (list):** a list of character cards — name, job, "N / 26 geared" count, and a
  couple of headline totals (from `computeTotals`).
- Selecting a card sets a single new renderer state variable `selectedCharacterId` and
  renders that character's **inventory view**.
- The inventory view has a **"← Roster"** control that clears `selectedCharacterId` and
  returns to the list.
- Adding/saving equipment refreshes the current view (list or inventory) in place.

## 5. The inventory grid

- **Layout:** two flanking columns of slot cells plus a bottom strip, with a center
  summary panel. Concrete slot arrangement (tunable):
  - **Left column:** `ring1`, `ring2`, `ring3`, `ring4`, `pendant1`, `pendant2`, `weapon`, `secondary`
  - **Right column:** `hat`, `top`, `bottom`, `shoes`, `gloves`, `cape`, `shoulder`, `belt`
  - **Bottom strip:** `face`, `eye`, `earring`, `emblem`, `pocket`, `badge`, `medal`, `heart`, `android`, `overall`
  - Every `EquipmentSlot` appears exactly once across these three groups. `overall` is shown
    in the bottom strip; the game hides top/bottom when overall is worn, but we simply show
    whichever slots have stored entries (all slots render; only those with an entry are
    "filled").
- **Center panel:** character name, job, "N / 26 geared", stat totals (`computeTotals`,
  flat and percent buckets), and set counts (`computeSetCounts`, e.g. "AbsoLab ×4").
- **Slot cell:**
  - **Empty:** dashed/muted border, slot label only.
  - **Filled:** solid **tier-colored border**, slot label, **★N** (gold), and **potential %**
    (the % values pulled from `potential.lines`, e.g. "+13% +10%"; empty if none).
  - **Click** a filled cell → toggles a detail panel rendering the existing `detailHtml`
    (Total / Base / Flame / SF table + potential lines). Flame turquoise, SF gold as before.

## 6. New pure helpers (testable)

Two DOM-free functions (so they unit-test cleanly), placed in a new
`src/renderer/inventory.ts` (keeping `compute.ts` focused on aggregation):

```ts
/** Border color for a potential tier, matching MapleStory's scheme.
 *  Rare=blue, Epic=purple, Unique=gold, Legendary=green; unknown/undefined=neutral. */
export function tierColor(tier: string | undefined): string;
```
- `tierColor("Legendary")` → green, `"Unique"` → gold, `"Epic"` → purple, `"Rare"` → blue
  (case-insensitive). Anything else / `undefined` → a neutral border color.

```ts
/** Compact "+13% +10%" string of the percent values in an item's potential lines.
 *  Returns "" when there are none. */
export function potentialPercents(data: EquipmentData): string;
```
- Pulls a `%` token from each `potential.lines[].value` (falling back to its `raw`); joins
  with a space. No percent lines → `""`.

**Corrected tier→color mapping** (the brainstorming mockup had Unique as purple; the
in-game scheme is): Rare = blue, Epic = purple, Unique = gold, Legendary = green.

## 7. Affected files

- `src/renderer/renderer.ts` — rework `renderRoster` into: character list → on-select
  inventory grid → slot-click detail. Add `selectedCharacterId` state and a small set of
  render helpers (`renderRosterList`, `renderInventory`, `renderSlotCell`). Reuse
  `detailHtml`, `computeTotals`, `computeSetCounts`, `escapeHtml`.
- `src/renderer/inventory.ts` — **new**: `tierColor`, `potentialPercents`, and the
  `SLOT_LAYOUT` constant (the three slot groups).
- `src/renderer/index.html` — CSS for the grid, slot cells (empty/filled), tier border
  colors, center panel, and the roster list.
- `test/inventory.test.ts` — **new**: unit tests for `tierColor` and `potentialPercents`.

## 8. Testing

- **Unit (`node:test`):** `tierColor` (each tier → expected color; unknown → neutral) and
  `potentialPercents` (lines with % → joined string; no % → "").
- **Build:** `npm run build` + `npm run typecheck` green; the renderer's `.js` value
  imports keep the `.js` extension (per Plan 2's ESM note).
- **Manual:** `npm start` → roster list → open a character → grid renders with filled/empty
  slots, tier borders, ★, potential % → click a slot → breakdown expands → "← Roster"
  returns.

## 9. Open questions

None. Sprite extraction is deliberately a separate follow-up spec.
