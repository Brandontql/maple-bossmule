# Paper-Doll Inventory + Capture UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin the roster into a per-character paper-doll equipment inventory, add Ctrl+V paste capture, and make the extraction preview fully editable — renderer only, no model/store/engine changes.

**Architecture:** A new DOM-free `src/renderer/inventory.ts` holds pure, testable helpers (`tierColor`, `potentialPercents`, `toNum`, `SLOT_LAYOUT`). `renderer.ts` gains a `selectedCharacterId` state and renders either a character list or one character's 5-column slot grid (reusing `detailHtml`, `computeTotals`, `computeSetCounts`); a document `paste` listener feeds the existing extract flow; and `showPending` becomes an editable form bound to a deep copy that the existing save persists.

**Tech Stack:** TypeScript, Electron renderer (vanilla DOM, native ES modules), `node:test`.

**Source of truth:** `docs/superpowers/specs/2026-06-14-paper-doll-inventory-design.md`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/renderer/inventory.ts` | Pure helpers: `tierColor`, `potentialPercents`, `toNum`, `SLOT_LAYOUT` | Create |
| `test/inventory.test.ts` | Unit tests for the helpers | Create |
| `src/renderer/renderer.ts` | Roster list → inventory grid → slot detail; paste; editable preview | Modify |
| `src/renderer/index.html` | CSS for grid/cells/center panel/list/editable form; Ctrl+V hint | Modify |

`renderer.ts` is the single DOM hub (existing pattern); pure logic goes to `inventory.ts` so it's unit-testable. Renderer value-imports `inventory.ts` with the `.js` extension (native ESM — same rule as Plan 2's `compute.js`).

---

## Task 1: Pure helpers (inventory.ts)

**Files:**
- Create: `src/renderer/inventory.ts`
- Test: `test/inventory.test.ts`

- [ ] **Step 1: Write the failing tests** — create `test/inventory.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { tierColor, potentialPercents, toNum, SLOT_LAYOUT } from "../src/renderer/inventory";
import type { EquipmentData } from "../src/shared/types";

test("tierColor maps tiers (MapleStory scheme); unknown -> neutral", () => {
  assert.equal(tierColor("Legendary"), "#5ac85a");
  assert.equal(tierColor("legendary"), "#5ac85a");
  assert.equal(tierColor("Unique"), "#f0c41b");
  assert.equal(tierColor("Epic"), "#b07cff");
  assert.equal(tierColor("Rare"), "#5aa9ff");
  assert.equal(tierColor(undefined), "#3a3f48");
  assert.equal(tierColor("Nonsense"), "#3a3f48");
});

function withLines(lines: { raw: string; value?: string }[]): EquipmentData {
  return { name: "x", stats: [], potential: { lines } };
}

test("potentialPercents pulls percent tokens, prefixes +, empty when none", () => {
  assert.equal(
    potentialPercents(withLines([{ raw: "INT +13%", value: "+13%" }, { raw: "INT +10%", value: "+10%" }])),
    "+13% +10%",
  );
  assert.equal(potentialPercents(withLines([{ raw: "HP Recovery 30%" }])), "+30%");
  assert.equal(potentialPercents(withLines([{ raw: "Some flat line" }])), "");
  assert.equal(potentialPercents(withLines([])), "");
});

test("toNum: blank/NaN -> undefined; numeric strings parse", () => {
  assert.equal(toNum(""), undefined);
  assert.equal(toNum("   "), undefined);
  assert.equal(toNum("abc"), undefined);
  assert.equal(toNum("17"), 17);
  assert.equal(toNum(" 5 "), 5);
  assert.equal(toNum("-3"), -3);
});

test("SLOT_LAYOUT has 25 placed slots, each unique, none is 'overall'", () => {
  assert.equal(SLOT_LAYOUT.length, 25);
  const slots = SLOT_LAYOUT.map((p) => p.slot);
  assert.equal(new Set(slots).size, 25);
  assert.ok(!slots.includes("overall"));
});
```

- [ ] **Step 2: Run tests to verify they fail** — Run: `npm test`. Expected: FAIL — `Cannot find module '../src/renderer/inventory'`.

- [ ] **Step 3: Implement `src/renderer/inventory.ts`**:

```ts
import type { EquipmentData, EquipmentSlot } from "../shared/types";

/** Border color for a potential tier (MapleStory scheme):
 *  Rare=blue, Epic=purple, Unique=gold, Legendary=green; unknown -> neutral. */
export function tierColor(tier: string | undefined): string {
  switch ((tier ?? "").toLowerCase()) {
    case "legendary": return "#5ac85a";
    case "unique": return "#f0c41b";
    case "epic": return "#b07cff";
    case "rare": return "#5aa9ff";
    default: return "#3a3f48";
  }
}

/** Compact "+13% +10%" of percent tokens in an item's potential lines; "" if none. */
export function potentialPercents(data: EquipmentData): string {
  const out: string[] = [];
  for (const line of data.potential.lines) {
    const src = line.value ?? line.raw ?? "";
    const m = src.match(/[+-]?\d+%/);
    if (!m) continue;
    out.push(/^[+-]/.test(m[0]) ? m[0] : `+${m[0]}`);
  }
  return out.join(" ");
}

/** Parse a user-entered number; blank/NaN -> undefined. */
export function toNum(value: string): number | undefined {
  const t = value.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return Number.isNaN(n) ? undefined : n;
}

/** Fixed paper-doll slot positions in a 5-column grid. Column 3 rows 1-5 are the
 *  center summary panel (not a slot); `overall` is handled dynamically (it takes
 *  the Top+Bottom area when worn), so it is intentionally absent here. */
export const SLOT_LAYOUT: { slot: EquipmentSlot; col: number; row: number }[] = [
  { slot: "ring1", col: 1, row: 1 }, { slot: "ring2", col: 1, row: 2 },
  { slot: "ring3", col: 1, row: 3 }, { slot: "ring4", col: 1, row: 4 },
  { slot: "belt", col: 1, row: 5 }, { slot: "pocket", col: 1, row: 6 },
  { slot: "face", col: 2, row: 1 }, { slot: "eye", col: 2, row: 2 },
  { slot: "earring", col: 2, row: 3 }, { slot: "pendant1", col: 2, row: 4 },
  { slot: "pendant2", col: 2, row: 5 }, { slot: "weapon", col: 2, row: 6 },
  { slot: "secondary", col: 3, row: 6 },
  { slot: "hat", col: 4, row: 1 }, { slot: "top", col: 4, row: 2 },
  { slot: "bottom", col: 4, row: 3 }, { slot: "shoulder", col: 4, row: 4 },
  { slot: "android", col: 4, row: 5 }, { slot: "emblem", col: 4, row: 6 },
  { slot: "cape", col: 5, row: 1 }, { slot: "gloves", col: 5, row: 2 },
  { slot: "shoes", col: 5, row: 3 }, { slot: "medal", col: 5, row: 4 },
  { slot: "heart", col: 5, row: 5 }, { slot: "badge", col: 5, row: 6 },
];
```

- [ ] **Step 4: Run tests to verify they pass** — Run: `npm test`. Expected: PASS — all `inventory` tests green plus the existing 19.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/inventory.ts test/inventory.test.ts
git commit -m "feat: inventory helpers (tierColor, potentialPercents, toNum, SLOT_LAYOUT)"
```

---

## Task 2: Styles (index.html)

**Files:**
- Modify: `src/renderer/index.html`

- [ ] **Step 1: Add the Ctrl+V hint to the drop zone**

Find the drop div text `Drop an equipment screenshot here, or click to choose a file` and change it to:

```
Drop an equipment screenshot here, click to choose a file, or press Ctrl+V
```

- [ ] **Step 2: Add CSS**

Inside `<style>`, after the existing `.struct dd` rule (added in Plan 2), add:

```css
      .char-card { cursor: pointer; }
      .char-card:hover { border-color: #9ad; }
      .char-head { display: flex; gap: 8px; align-items: baseline; }
      .back-btn { margin-bottom: 10px; }
      .paperdoll { display: grid; grid-template-columns: repeat(5, 1fr); grid-auto-rows: 52px; gap: 6px; margin-top: 6px; }
      .pd-cell { border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 11px; padding: 2px; text-align: center; }
      .pd-cell.empty { border: 1px dashed #3a3f48; color: #666; }
      .pd-cell.filled { border: 1.5px solid #3a3f48; background: #22252c; cursor: pointer; }
      .pd-cell.filled:hover { filter: brightness(1.15); }
      .pd-label { color: #9aa; font-size: 10px; line-height: 1.1; }
      .pd-star { color: #e0a93b; font-size: 11px; }
      .pd-pot { color: #8cf; font-size: 9px; line-height: 1.1; }
      .pd-summary { border: 0.5px solid #2a2d34; border-radius: 8px; background: #1b1d22; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 8px; text-align: center; }
      .pd-name { font-weight: 600; font-size: 13px; }
      .slot-detail { margin-top: 10px; }
      .slot-detail-head { font-size: 13px; font-weight: 600; margin-bottom: 4px; color: #cde; }
      .ef-row { display: flex; align-items: center; gap: 8px; margin: 3px 0; font-size: 12px; }
      .ef-label { width: 92px; color: #9ad; }
      .ef-row input[type=text], .ef-row input[type=number] { flex: 1; }
      .ef-section { margin-top: 8px; color: #9ad; font-size: 12px; }
      .ef-stat, .ef-pot { display: flex; gap: 4px; margin: 2px 0; }
      .ef-key { width: 84px; }
      .ef-num { width: 58px; }
```

(No build/test changes here; verified by the Task 3–5 builds.)

---

## Task 3: Roster list + inventory grid (renderer.ts)

**Files:**
- Modify: `src/renderer/renderer.ts`

- [ ] **Step 1: Update imports and add state**

Replace the import block at the top (lines 1–4) with:

```ts
import type { TrackerApi } from "../shared/ipc";
import type { Character, EquipmentData, EquipmentEntry, EquipmentSlot, StatLine } from "../shared/types";
import { computeTotals, computeSetCounts } from "./compute.js";
import { tierColor, potentialPercents, toNum, SLOT_LAYOUT } from "./inventory.js";
```

Below the existing `let pending: EquipmentData | null = null;` add:

```ts
/** When set, the roster shows this character's inventory instead of the list. */
let selectedCharacterId: string | null = null;
/** Which slot's detail panel is open in the inventory view. */
let openSlot: string | null = null;
```

- [ ] **Step 2: Delete the now-unused `statSummary` function**

Remove the entire `statSummary` function (the `/** Compact one-line stat summary ... */` block). `breakdownRow` and `detailHtml` stay (still used).

- [ ] **Step 3: Replace `renderRoster` with the list/inventory dispatcher + helpers**

Replace the entire existing `renderRoster` function with:

```ts
/** Title-case a slot id into a label, e.g. "ring1" -> "Ring 1". */
function slotLabel(slot: string): string {
  const m = slot.match(/^([a-z]+)(\d*)$/);
  if (!m) return slot;
  const base = m[1].charAt(0).toUpperCase() + m[1].slice(1);
  return m[2] ? `${base} ${m[2]}` : base;
}

function renderRoster(characters: Character[]): void {
  const root = $<HTMLDivElement>("roster");
  root.innerHTML = "";
  if (characters.length === 0) {
    root.textContent = "No characters yet. Add one above.";
    return;
  }
  if (selectedCharacterId) {
    const c = characters.find((x) => x.id === selectedCharacterId);
    if (c) {
      renderInventory(root, c);
      return;
    }
    selectedCharacterId = null;
  }
  renderRosterList(root, characters);
}

function renderRosterList(root: HTMLElement, characters: Character[]): void {
  for (const c of characters) {
    const card = document.createElement("div");
    card.className = "card char-card";
    const totals = computeTotals(c.equipment)
      .filter((t) => t.key !== "UNKNOWN")
      .slice(0, 3)
      .map((t) => `${t.key} ${t.isPercent ? `${t.total}%` : `+${t.total}`}`)
      .join(" · ");
    card.innerHTML =
      `<div class="char-head"><b>${escapeHtml(c.name)}</b>` +
      `<span class="muted">${escapeHtml(c.job ?? "")}</span></div>` +
      `<div class="muted">${c.equipment.length} / 26 geared</div>` +
      (totals ? `<div class="muted">${escapeHtml(totals)}</div>` : "");
    card.onclick = () => {
      selectedCharacterId = c.id;
      openSlot = null;
      refreshCharacters();
    };
    root.appendChild(card);
  }
}

function slotCell(
  slot: EquipmentSlot,
  col: number,
  row: number,
  entry: EquipmentEntry | undefined,
): HTMLElement {
  const cell = document.createElement("div");
  cell.style.gridColumn = String(col);
  cell.style.gridRow = String(row);
  if (!entry) {
    cell.className = "pd-cell empty";
    cell.innerHTML = `<span class="pd-label">${slotLabel(slot)}</span>`;
    return cell;
  }
  const d = entry.data;
  cell.className = "pd-cell filled";
  cell.style.borderColor = tierColor(d.potential.tier);
  const pct = potentialPercents(d);
  cell.innerHTML =
    `<span class="pd-label">${slotLabel(slot)}</span>` +
    `<span class="pd-star">★${d.starForce ?? 0}</span>` +
    (pct ? `<span class="pd-pot">${escapeHtml(pct)}</span>` : "");
  cell.onclick = () => showSlotDetail(slot, d);
  return cell;
}

function showSlotDetail(slot: string, d: EquipmentData): void {
  const panel = $<HTMLDivElement>("slotDetail");
  if (openSlot === slot) {
    panel.innerHTML = "";
    openSlot = null;
    return;
  }
  openSlot = slot;
  panel.innerHTML =
    `<div class="slot-detail-head">${slotLabel(slot)} — ${escapeHtml(d.name)}</div>` +
    detailHtml(d);
}

function renderInventory(root: HTMLElement, c: Character): void {
  openSlot = null;

  const back = document.createElement("button");
  back.className = "back-btn";
  back.textContent = "← Roster";
  back.onclick = () => {
    selectedCharacterId = null;
    refreshCharacters();
  };
  root.appendChild(back);

  const title = document.createElement("h3");
  title.textContent = c.job ? `${c.name} — ${c.job}` : c.name;
  root.appendChild(title);

  const bySlot = new Map<string, EquipmentEntry>();
  for (const e of c.equipment) bySlot.set(e.slot, e);

  const grid = document.createElement("div");
  grid.className = "paperdoll";

  const summary = document.createElement("div");
  summary.className = "pd-summary";
  summary.style.gridColumn = "3";
  summary.style.gridRow = "1 / 6";
  const totals = computeTotals(c.equipment)
    .filter((t) => t.key !== "UNKNOWN")
    .slice(0, 4)
    .map((t) => `${t.key} ${t.isPercent ? `${t.total}%` : `+${t.total}`}`)
    .join(" · ");
  const sets = computeSetCounts(c.equipment)
    .map((s) => `${s.set} ×${s.count}`)
    .join(" · ");
  summary.innerHTML =
    `<div class="pd-name">${escapeHtml(c.name)}</div>` +
    `<div class="muted">${c.equipment.length} / 26 geared</div>` +
    (totals ? `<div class="muted">${escapeHtml(totals)}</div>` : "") +
    (sets ? `<div class="muted">${escapeHtml(sets)}</div>` : "");
  grid.appendChild(summary);

  const hasOverall = bySlot.has("overall");
  for (const pos of SLOT_LAYOUT) {
    if (hasOverall && (pos.slot === "top" || pos.slot === "bottom")) continue;
    grid.appendChild(slotCell(pos.slot, pos.col, pos.row, bySlot.get(pos.slot)));
  }
  if (hasOverall) {
    const cell = slotCell("overall", 4, 2, bySlot.get("overall"));
    cell.style.gridRow = "2 / 4";
    grid.appendChild(cell);
  }
  root.appendChild(grid);

  const detail = document.createElement("div");
  detail.id = "slotDetail";
  detail.className = "slot-detail";
  root.appendChild(detail);
}
```

- [ ] **Step 4: Build + typecheck + test**

Run: `npm run typecheck` → exit 0.
Run: `npm run build` → exit 0. Confirm `dist/renderer/inventory.js` exists and `dist/renderer/renderer.js` contains `from "./inventory.js"`.
Run: `npm test` → 23 pass (19 + 4 inventory; renderer not unit-tested).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/renderer.ts src/renderer/index.html
git commit -m "feat: per-character paper-doll inventory view"
```

---

## Task 4: Clipboard paste (renderer.ts)

**Files:**
- Modify: `src/renderer/renderer.ts`

- [ ] **Step 1: Add a paste listener in `wireUp`**

Inside `wireUp`, after the drag-drop block (after the `drop.ondrop = ...` handler assignment) and before the Save handler, add:

```ts
  // Paste an image from the clipboard (Ctrl+V) -> same extract flow.
  document.addEventListener("paste", (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleFile(file);
        }
        return;
      }
    }
  });
```

- [ ] **Step 2: Build + verify**

Run: `npm run build` → exit 0.
Run: `npm test` → 23 pass (no regression).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/renderer.ts
git commit -m "feat: paste a screenshot with Ctrl+V"
```

---

## Task 5: Editable extraction preview (renderer.ts)

**Files:**
- Modify: `src/renderer/renderer.ts`

- [ ] **Step 1: Replace `showPending` with the editable form**

Replace the entire existing `showPending` function with the following (it binds inputs to a deep copy stored in `pending`, which the existing Save handler already persists):

```ts
function textField(
  labelText: string,
  value: string,
  onChange: (v: string) => void,
): HTMLElement {
  const row = document.createElement("label");
  row.className = "ef-row";
  const span = document.createElement("span");
  span.className = "ef-label";
  span.textContent = labelText;
  const inp = document.createElement("input");
  inp.type = "text";
  inp.value = value;
  inp.oninput = () => onChange(inp.value);
  row.append(span, inp);
  return row;
}

function numberField(
  labelText: string,
  value: number | undefined,
  onChange: (v: number | undefined) => void,
): HTMLElement {
  const row = document.createElement("label");
  row.className = "ef-row";
  const span = document.createElement("span");
  span.className = "ef-label";
  span.textContent = labelText;
  const inp = document.createElement("input");
  inp.type = "number";
  inp.value = value == null ? "" : String(value);
  inp.oninput = () => onChange(toNum(inp.value));
  row.append(span, inp);
  return row;
}

function miniNum(
  value: number | undefined,
  placeholder: string,
  onChange: (v: number | undefined) => void,
): HTMLInputElement {
  const inp = document.createElement("input");
  inp.type = "number";
  inp.className = "ef-num";
  inp.placeholder = placeholder;
  inp.value = value == null ? "" : String(value);
  inp.oninput = () => onChange(toNum(inp.value));
  return inp;
}

function showPending(data: EquipmentData): void {
  const p: EquipmentData = structuredClone(data);
  pending = p;
  const out = $<HTMLDivElement>("result");
  out.innerHTML = "";

  out.appendChild(textField("Name", p.name, (v) => (p.name = v)));
  out.appendChild(numberField("Star Force", p.starForce, (v) => (p.starForce = v)));
  out.appendChild(textField("Category", p.category ?? "", (v) => (p.category = v || undefined)));
  out.appendChild(textField("Job", p.requiredJob ?? "", (v) => (p.requiredJob = v || undefined)));
  out.appendChild(numberField("Level", p.requiredLevel, (v) => (p.requiredLevel = v)));
  out.appendChild(textField("Set", p.set ?? "", (v) => (p.set = v || undefined)));

  const tradeRow = document.createElement("label");
  tradeRow.className = "ef-row";
  const tradeCb = document.createElement("input");
  tradeCb.type = "checkbox";
  tradeCb.checked = p.tradable === false;
  tradeCb.oninput = () => (p.tradable = tradeCb.checked ? false : undefined);
  const tradeSpan = document.createElement("span");
  tradeSpan.textContent = "Untradable";
  tradeRow.append(tradeCb, tradeSpan);
  out.appendChild(tradeRow);

  const tierRow = document.createElement("label");
  tierRow.className = "ef-row";
  const tierSpan = document.createElement("span");
  tierSpan.className = "ef-label";
  tierSpan.textContent = "Potential tier";
  const tierSel = document.createElement("select");
  for (const t of ["", "Rare", "Epic", "Unique", "Legendary"]) {
    const o = document.createElement("option");
    o.value = t;
    o.textContent = t || "(none)";
    if ((p.potential.tier ?? "") === t) o.selected = true;
    tierSel.appendChild(o);
  }
  tierSel.oninput = () => (p.potential.tier = tierSel.value || undefined);
  tierRow.append(tierSpan, tierSel);
  out.appendChild(tierRow);

  const statHead = document.createElement("div");
  statHead.className = "ef-section";
  statHead.textContent = "Stats (key · % · total · base · flame · SF)";
  out.appendChild(statHead);
  for (const s of p.stats) {
    const row = document.createElement("div");
    row.className = "ef-stat";
    const key = document.createElement("input");
    key.type = "text";
    key.className = "ef-key";
    key.value = s.key;
    key.oninput = () => (s.key = key.value);
    const pct = document.createElement("input");
    pct.type = "checkbox";
    pct.checked = s.isPercent;
    pct.title = "percent";
    pct.oninput = () => (s.isPercent = pct.checked);
    row.append(
      key,
      pct,
      miniNum(s.breakdown.total, "total", (v) => (s.breakdown.total = v ?? 0)),
      miniNum(s.breakdown.base, "base", (v) => (s.breakdown.base = v)),
      miniNum(s.breakdown.flame, "flame", (v) => (s.breakdown.flame = v)),
      miniNum(s.breakdown.starForce, "SF", (v) => (s.breakdown.starForce = v)),
    );
    out.appendChild(row);
  }

  const potHead = document.createElement("div");
  potHead.className = "ef-section";
  potHead.textContent = "Potential lines (text · value · key)";
  out.appendChild(potHead);
  for (const line of p.potential.lines) {
    const row = document.createElement("div");
    row.className = "ef-pot";
    const raw = document.createElement("input");
    raw.type = "text";
    raw.value = line.raw;
    raw.oninput = () => (line.raw = raw.value);
    const val = document.createElement("input");
    val.type = "text";
    val.className = "ef-key";
    val.placeholder = "value";
    val.value = line.value ?? "";
    val.oninput = () => (line.value = val.value || undefined);
    const key = document.createElement("input");
    key.type = "text";
    key.className = "ef-key";
    key.placeholder = "key";
    key.value = line.key ?? "";
    key.oninput = () => (line.key = key.value || undefined);
    row.append(raw, val, key);
    out.appendChild(row);
  }

  $<HTMLButtonElement>("save").disabled = false;
}
```

(The Save handler is unchanged — it already saves `pending`, which now holds the edited copy. The `out` element `#result` is a `<pre>`; appending DOM children to it is fine.)

- [ ] **Step 2: Build + typecheck + test**

Run: `npm run typecheck` → exit 0.
Run: `npm run build` → exit 0.
Run: `npm test` → 23 pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/renderer.ts
git commit -m "feat: editable extraction preview (incl. breakdown)"
```

---

## Task 6: Verification gate

**Files:** none (verification only)

- [ ] **Step 1: Full build + checks**

Run: `npm run typecheck` → exit 0.
Run: `npm run build` → exit 0.
Run: `npm test` → all suites PASS (23).

- [ ] **Step 2: Manual (`npm start`)**

Confirm:
- Roster shows a **list** of character cards; clicking one opens the **paper-doll grid** (slots in the 5-column layout, center summary, ★/potential %/tier border on filled slots, dashed empty slots). "← Roster" returns.
- Clicking a filled slot expands its Total/Base/**Flame**/SF breakdown + potential below the grid; clicking again hides it.
- Copy any image to the clipboard and press **Ctrl+V** → the editable preview appears.
- In the preview, every field is editable (including a stat's flame/SF). Edit a value, pick a character + slot, **Save** → reopen that character's inventory → the slot reflects the edited value.

- [ ] **Step 3: Commit any touch-ups** (only if Step 2 surfaced a fix)

---

## Done criteria

- `npm run typecheck`, `npm run build`, `npm test` (23) all pass.
- Roster is a list → per-character paper-doll grid → slot-click breakdown.
- Ctrl+V pastes a screenshot into the extract flow.
- The extraction preview is fully editable (incl. breakdown) and edits persist on save.
- No model/store/engine changes; persistence stays JSON.
