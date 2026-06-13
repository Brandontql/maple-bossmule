# Rich Roster UI & Aggregation — Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the rich `EquipmentData` (from Plan 1) in the roster as a per-character comparison table with a click-to-expand detail card (full Total/Base/Flame/SF breakdown + potential), show per-character stat totals and set-completion, and render the extraction preview as structured fields instead of raw JSON.

**Architecture:** Add a pure aggregation module (`src/renderer/compute.ts`) with no DOM dependency so totals/set-completion are unit-testable. Rewrite the renderer's `renderRoster` to build, per character, a comparison table (one row per equipped item) plus a totals row and set-completion summary, where clicking a row toggles a detail panel. Replace the raw-JSON `showPending` preview with structured rendering. Add CSS for the table, detail panel, and the flame (turquoise) / star-force (gold) accents.

**Tech Stack:** TypeScript, Electron renderer (vanilla DOM), `node:test`.

**Builds on:** Plan 1 (`docs/superpowers/plans/2026-06-14-rich-equipment-model-extraction.md`) — the rich `EquipmentData` model is already in place. Source of truth: `docs/superpowers/specs/2026-06-13-richer-equipment-model-design.md` §7–§8.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/renderer/compute.ts` | Pure totals + set-count aggregation over equipment | Create |
| `test/compute.test.ts` | Unit tests for the aggregation | Create |
| `src/renderer/renderer.ts` | Comparison table + detail panel + structured preview | Modify |
| `src/renderer/index.html` | CSS for table / detail / flame+SF accents | Modify |
| `tsconfig.test.json` | Allow `compute.ts` (a renderer file) into the test build | Modify |

**Note on the test build:** `tsconfig.json` excludes `src/renderer/renderer.ts` (it's compiled separately by `tsconfig.renderer.json`, which provides the DOM lib). `compute.ts` is DOM-free, so it can compile in the test build. The base `tsconfig.json` exclude only names `renderer.ts`, so `compute.ts` is already included by `src/**/*.ts` — no exclude change needed. Task 1 Step 1 verifies this; if `compute.ts` ever imports DOM types, move it out of the test build instead.

---

## Task 1: Aggregation module (compute.ts)

**Files:**
- Create: `src/renderer/compute.ts`
- Test: `test/compute.test.ts`

- [ ] **Step 1: Write the failing tests** — create `test/compute.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTotals, computeSetCounts } from "../src/renderer/compute";
import type { EquipmentData, EquipmentEntry } from "../src/shared/types";

function entry(slot: string, data: Partial<EquipmentData>): EquipmentEntry {
  return {
    slot: slot as EquipmentEntry["slot"],
    capturedAt: "2026-01-01T00:00:00Z",
    data: { name: "x", stats: [], potential: { lines: [] }, ...data },
  };
}

test("computeTotals sums flat stats by key across items", () => {
  const eq = [
    entry("cape", { stats: [{ key: "INT", isPercent: false, breakdown: { total: 107 }, raw: "" }] }),
    entry("hat", { stats: [{ key: "INT", isPercent: false, breakdown: { total: 93 }, raw: "" }] }),
  ];
  const totals = computeTotals(eq);
  const int = totals.find((t) => t.key === "INT" && !t.isPercent);
  assert.equal(int.total, 200);
});

test("computeTotals keeps percent and flat buckets separate", () => {
  const eq = [
    entry("cape", { stats: [{ key: "ALL_STAT", isPercent: true, breakdown: { total: 5 }, raw: "" }] }),
    entry("hat", { stats: [{ key: "ALL_STAT", isPercent: true, breakdown: { total: 4 }, raw: "" }] }),
  ];
  const totals = computeTotals(eq);
  const pct = totals.find((t) => t.key === "ALL_STAT" && t.isPercent);
  assert.equal(pct.total, 9);
  assert.equal(pct.isPercent, true);
});

test("computeTotals ignores stats with no usable total", () => {
  const eq = [entry("cape", { stats: [{ key: "STR", isPercent: false, breakdown: { total: 0 }, raw: "" }] })];
  const totals = computeTotals(eq);
  assert.equal(totals.find((t) => t.key === "STR").total, 0);
});

test("computeSetCounts groups equipped items by set name", () => {
  const eq = [
    entry("cape", { set: "AbsoLab Set (Magician)" }),
    entry("hat", { set: "AbsoLab Set (Magician)" }),
    entry("shoes", { set: "Arcane Umbra Set" }),
    entry("ring1", {}), // no set
  ];
  const counts = computeSetCounts(eq);
  const abso = counts.find((c) => c.set === "AbsoLab Set (Magician)");
  assert.equal(abso.count, 2);
  assert.equal(counts.find((c) => c.set === "Arcane Umbra Set").count, 1);
  assert.equal(counts.length, 2); // items with no set are excluded
});
```

- [ ] **Step 2: Run tests to verify they fail** — Run: `npm test`. Expected: FAIL — `Cannot find module '../src/renderer/compute'`.

- [ ] **Step 3: Implement `src/renderer/compute.ts`**:

```ts
import type { EquipmentEntry } from "../shared/types";

/** A summed stat across a character's equipment. */
export interface StatTotal {
  key: string;
  total: number;
  isPercent: boolean;
}

/** A set name and how many equipped pieces belong to it. */
export interface SetCount {
  set: string;
  count: number;
}

/** Sum stats by key across all equipped items. Flat (+N) and percent (N%)
 *  values are summed into separate buckets so they are never mixed. */
export function computeTotals(equipment: EquipmentEntry[]): StatTotal[] {
  const byBucket = new Map<string, StatTotal>();
  for (const entry of equipment) {
    for (const stat of entry.data.stats) {
      const total = stat.breakdown?.total;
      if (typeof total !== "number" || Number.isNaN(total)) continue;
      const bucket = `${stat.key}|${stat.isPercent ? "%" : "+"}`;
      const existing = byBucket.get(bucket);
      if (existing) existing.total += total;
      else byBucket.set(bucket, { key: stat.key, total, isPercent: stat.isPercent });
    }
  }
  return [...byBucket.values()];
}

/** Count equipped pieces per set name. Items with no set are excluded. */
export function computeSetCounts(equipment: EquipmentEntry[]): SetCount[] {
  const counts = new Map<string, number>();
  for (const entry of equipment) {
    const set = entry.data.set;
    if (!set) continue;
    counts.set(set, (counts.get(set) ?? 0) + 1);
  }
  return [...counts.entries()].map(([set, count]) => ({ set, count }));
}
```

- [ ] **Step 4: Run tests to verify they pass** — Run: `npm test`. Expected: PASS — all `compute` tests green plus the existing 15.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/compute.ts test/compute.test.ts
git commit -m "feat: roster totals + set-count aggregation"
```

---

## Task 2: Roster styles (index.html)

**Files:**
- Modify: `src/renderer/index.html`

- [ ] **Step 1: Update the heading phase label**

Find `<span class="muted">(Phase 1)</span>` and change it to `<span class="muted">(Phase 2)</span>`.

- [ ] **Step 2: Add CSS for the table, detail panel, and accents**

Inside the `<style>` block, after the existing `.equip` / `.muted` rules, add:

```css
      table.roster { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
      table.roster th, table.roster td { text-align: left; padding: 4px 8px; border-bottom: 1px solid #2a2d34; }
      table.roster th { color: #9ad; font-weight: 600; }
      table.roster td.num, table.roster th.num { text-align: right; font-variant-numeric: tabular-nums; }
      tr.item { cursor: pointer; }
      tr.item:hover { background: #262a31; }
      tr.totals td { border-top: 2px solid #3a3f48; font-weight: 600; color: #cde; }
      .star { color: #e0a93b; }            /* star force = gold */
      .flame { color: #2ec4b6; }           /* flame / bonus = turquoise */
      .setbadge { font-size: 11px; color: #9ad; }
      .detail { background: #1b1d22; }
      .detail-inner { padding: 8px 10px; }
      table.bd { border-collapse: collapse; font-size: 12px; margin: 4px 0; }
      table.bd th, table.bd td { padding: 2px 10px; text-align: right; }
      table.bd th:first-child, table.bd td:first-child { text-align: left; }
      table.bd th { color: #888; font-weight: 500; }
      .pot { margin-top: 6px; font-size: 12px; }
      .pot .tier { color: #5ac85a; font-weight: 600; }
      .struct dt { color: #9ad; font-size: 12px; margin-top: 6px; }
      .struct dd { margin: 0 0 2px; font-size: 13px; }
```

(No structural HTML change beyond Step 1 — the renderer builds the table into the existing `#roster` and `#result` containers.)

---

## Task 3: Comparison table + detail panel (renderer.ts)

**Files:**
- Modify: `src/renderer/renderer.ts`

- [ ] **Step 1: Import the aggregation helpers**

At the top of `src/renderer/renderer.ts`, the existing import is:

```ts
import type { Character, EquipmentData, EquipmentSlot } from "../shared/types";
```

Add, on the following line:

```ts
import type { StatLine } from "../shared/types";
import { computeTotals, computeSetCounts } from "./compute.js";
```

**Why `./compute.js` (not `./compute`):** `tsconfig.renderer.json` emits native ES modules
(`module: ES2020`) loaded via `<script type="module">`. This is the renderer's first
runtime (value) import — type-only imports are erased, so the extension never mattered
before. The browser/Electron ESM loader requires the explicit `.js` extension; TypeScript
does NOT rewrite it. The `.js` specifier correctly resolves to `compute.ts` at compile
time and to the emitted `compute.js` at runtime. (The Node-based `node:test` build is
CommonJS, so `test/compute.test.ts` imports `../src/renderer/compute` WITHOUT the
extension — that is correct for that build and must stay as written in Task 1.)

- [ ] **Step 2: Replace `renderRoster` with the table + detail version**

Replace the entire existing `renderRoster` function with:

```ts
/** Compact one-line stat summary for a table row, e.g. "INT +107 · MATT +53". */
function statSummary(stats: StatLine[]): string {
  return stats
    .filter((s) => s.key !== "UNKNOWN")
    .slice(0, 4)
    .map((s) => `${s.key} ${s.isPercent ? `${s.breakdown.total}%` : `+${s.breakdown.total}`}`)
    .join(" · ");
}

/** One Total/Base/Flame/SF row in the detail breakdown table. */
function breakdownRow(s: StatLine): string {
  const b = s.breakdown;
  const cell = (n: number | undefined, cls = "") =>
    n == null ? `<td class="num">–</td>` : `<td class="num ${cls}">${n}</td>`;
  const total = s.isPercent ? `${b.total}%` : `+${b.total}`;
  return (
    `<tr><td>${escapeHtml(s.key)}</td><td class="num">${total}</td>` +
    `${cell(b.base)}${cell(b.flame, "flame")}${cell(b.starForce, "star")}</tr>`
  );
}

/** The expandable detail panel for one equipment entry. */
function detailHtml(data: EquipmentData): string {
  const meta = [
    data.category,
    data.requiredJob,
    data.requiredLevel != null ? `Lv${data.requiredLevel}` : null,
    data.tradable === false ? "Untradable" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const rows = data.stats.map(breakdownRow).join("");
  const table = rows
    ? `<table class="bd"><tr><th>Stat</th><th class="num">Total</th>` +
      `<th class="num">Base</th><th class="num flame">Flame</th><th class="num star">SF</th></tr>${rows}</table>`
    : "";
  const pot = data.potential.lines.length
    ? `<div class="pot">${data.potential.tier ? `<span class="tier">${escapeHtml(data.potential.tier)}</span> ` : ""}` +
      data.potential.lines.map((p) => escapeHtml(p.raw)).join("<br>") +
      `</div>`
    : "";
  return (
    `<div class="detail-inner">` +
    (meta ? `<div class="muted">${escapeHtml(meta)}</div>` : "") +
    table +
    pot +
    `</div>`
  );
}

function renderRoster(characters: Character[]): void {
  const root = $<HTMLDivElement>("roster");
  root.innerHTML = "";
  if (characters.length === 0) {
    root.textContent = "No characters yet. Add one above.";
    return;
  }

  for (const c of characters) {
    const card = document.createElement("div");
    card.className = "card";

    const title = document.createElement("h3");
    title.textContent = c.job ? `${c.name} — ${c.job}` : c.name;
    card.appendChild(title);

    if (c.equipment.length === 0) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "No equipment captured.";
      card.appendChild(p);
      root.appendChild(card);
      continue;
    }

    const table = document.createElement("table");
    table.className = "roster";

    const head = document.createElement("tr");
    head.innerHTML =
      `<th>Slot</th><th class="num">★</th><th>Item</th><th>Stats</th><th>Set</th>`;
    table.appendChild(head);

    for (const entry of c.equipment) {
      const d = entry.data;
      const itemRow = document.createElement("tr");
      itemRow.className = "item";
      const sf = d.starForce != null ? `<span class="star">${d.starForce}</span>` : "–";
      const tier = d.potential.tier ? ` <span class="setbadge">[${escapeHtml(d.potential.tier)}]</span>` : "";
      itemRow.innerHTML =
        `<td>${escapeHtml(entry.slot)}</td>` +
        `<td class="num">${sf}</td>` +
        `<td>${escapeHtml(d.name)}${tier}</td>` +
        `<td class="muted">${escapeHtml(statSummary(d.stats))}</td>` +
        `<td class="setbadge">${escapeHtml(d.set ?? "")}</td>`;

      const detailRow = document.createElement("tr");
      detailRow.className = "detail";
      detailRow.style.display = "none";
      detailRow.innerHTML = `<td colspan="5">${detailHtml(d)}</td>`;

      itemRow.onclick = () => {
        detailRow.style.display = detailRow.style.display === "none" ? "" : "none";
      };

      table.appendChild(itemRow);
      table.appendChild(detailRow);
    }

    // Totals row
    const totals = computeTotals(c.equipment);
    if (totals.length) {
      const totalsRow = document.createElement("tr");
      totalsRow.className = "totals";
      const txt = totals
        .filter((t) => t.key !== "UNKNOWN")
        .map((t) => `${t.key} ${t.isPercent ? `${t.total}%` : `+${t.total}`}`)
        .join(" · ");
      totalsRow.innerHTML = `<td colspan="3">Totals</td><td colspan="2">${escapeHtml(txt)}</td>`;
      table.appendChild(totalsRow);
    }

    card.appendChild(table);

    // Set-completion summary
    const sets = computeSetCounts(c.equipment);
    if (sets.length) {
      const setLine = document.createElement("div");
      setLine.className = "setbadge";
      setLine.style.marginTop = "6px";
      setLine.textContent =
        "Sets: " + sets.map((s) => `${s.set} ×${s.count}`).join("  ·  ");
      card.appendChild(setLine);
    }

    root.appendChild(card);
  }
}
```

- [ ] **Step 3: Build and verify the renderer compiles**

Run: `npm run build`
Expected: exit 0 (both main and renderer tsconfigs compile, assets copied).

- [ ] **Step 4: Run the test suite (no regressions)**

Run: `npm test`
Expected: PASS (compute + Plan-1 tests; renderer is not unit-tested).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/renderer.ts src/renderer/index.html
git commit -m "feat: roster comparison table with expandable breakdown + totals/sets"
```

---

## Task 4: Structured extraction preview (renderer.ts)

**Files:**
- Modify: `src/renderer/renderer.ts`

- [ ] **Step 1: Replace `showPending` with structured rendering**

Replace the existing `showPending` function with:

```ts
function showPending(data: EquipmentData): void {
  pending = data;
  const out = $<HTMLPreElement>("result");
  const sf = data.starForce != null ? ` · <span class="star">★${data.starForce}</span>` : "";
  const meta = [
    data.category,
    data.requiredJob,
    data.requiredLevel != null ? `Lv${data.requiredLevel}` : null,
    data.set,
    data.tradable === false ? "Untradable" : null,
  ]
    .filter(Boolean)
    .map((m) => escapeHtml(String(m)))
    .join(" · ");

  out.innerHTML =
    `<div class="struct">` +
    `<div><b>${escapeHtml(data.name)}</b>${sf}</div>` +
    (meta ? `<div class="muted">${meta}</div>` : "") +
    `<dl>` +
    `<dt>Stats</dt>` +
    data.stats.map((s) => `<dd>${escapeHtml(s.raw)}</dd>`).join("") +
    (data.potential.lines.length
      ? `<dt>Potential${data.potential.tier ? ` — ${escapeHtml(data.potential.tier)}` : ""}</dt>` +
        data.potential.lines.map((p) => `<dd>${escapeHtml(p.raw)}</dd>`).join("")
      : "") +
    `</dl></div>`;

  $<HTMLButtonElement>("save").disabled = false;
}
```

Note: `#result` is a `<pre>`; the structured HTML renders fine inside it. The `.struct` CSS (added in Task 2) styles the `dt`/`dd`.

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Run the test suite**

Run: `npm test`
Expected: PASS (unchanged count; renderer not unit-tested).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/renderer.ts
git commit -m "feat: structured extraction preview instead of raw JSON"
```

---

## Task 5: Verification gate

**Files:** none (verification only)

- [ ] **Step 1: Full build + test**

Run: `npm run build` → exit 0.
Run: `npm run typecheck` → exit 0.
Run: `npm test` → all suites PASS.

- [ ] **Step 2: Launch the app and confirm the UI (manual)**

Run: `npm start` (builds + launches Electron).
Confirm:
- Add a boss mule (name + job), it appears in the roster.
- Extract via the **stub** engine (drag any image), the preview shows structured fields (name, ★, meta, stats, potential) — not raw JSON.
- Save it to the character + a slot; the roster shows a table row; clicking the row expands the Total/Base/Flame/SF breakdown (flame turquoise, SF gold) and potential lines; a Totals row and a "Sets:" line appear.
- Close the window to exit.

- [ ] **Step 3: Commit any final touch-ups** (only if Step 2 surfaced a fix)

---

## Done criteria

- `npm run build`, `npm run typecheck`, `npm test` all pass.
- The roster renders a per-character comparison table; rows expand to the breakdown + potential; totals and set-counts show.
- The extraction preview is structured, not raw JSON.
- Flame renders turquoise, star force gold.
