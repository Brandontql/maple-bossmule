import type { TrackerApi } from "../shared/ipc";
import type { Character, EquipmentData, EquipmentEntry, EquipmentSlot, StatLine } from "../shared/types";
import { computeTotals, computeSetCounts } from "./compute.js";
import { tierColor, potentialPercents, toNum, SLOT_LAYOUT } from "./inventory.js";

declare global {
  interface Window {
    api: TrackerApi;
  }
}

const SLOTS: EquipmentSlot[] = [
  "weapon", "secondary", "emblem", "hat", "top", "bottom", "overall",
  "shoes", "gloves", "cape", "belt", "shoulder", "face", "eye", "earring",
  "ring1", "ring2", "ring3", "ring4", "pendant1", "pendant2", "pocket",
  "badge", "medal", "heart", "android",
];

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

/** Last extracted result, held until the user assigns it to a slot. */
let pending: EquipmentData | null = null;

/** When set, the roster shows this character's inventory instead of the list. */
let selectedCharacterId: string | null = null;
/** Which slot's detail panel is open in the inventory view. */
let openSlot: string | null = null;

async function refreshEngines(): Promise<void> {
  const engines = await window.api.listEngines();
  const sel = $<HTMLSelectElement>("engine");
  sel.innerHTML = "";
  for (const e of engines) {
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = e.label;
    sel.appendChild(opt);
  }
  sel.onchange = () => window.api.setEngine(sel.value);
}

function fillSlots(): void {
  const sel = $<HTMLSelectElement>("slot");
  for (const s of SLOTS) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    sel.appendChild(opt);
  }
}

async function refreshCharacters(): Promise<void> {
  const characters = await window.api.getCharacters();
  renderCharacterSelect(characters);
  renderRoster(characters);
}

function renderCharacterSelect(characters: Character[]): void {
  const sel = $<HTMLSelectElement>("character");
  sel.innerHTML = "";
  for (const c of characters) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.job ? `${c.name} (${c.job})` : c.name;
    sel.appendChild(opt);
  }
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

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

async function handleFile(file: File): Promise<void> {
  const buf = await file.arrayBuffer();
  const imageBase64 = arrayBufferToBase64(buf);
  setStatus("Extracting…");
  try {
    const data = await window.api.extract({ imageBase64, mimeType: file.type });
    showPending(data);
    setStatus(`Extracted from ${file.name}. Review, pick a slot, then Save.`);
  } catch (err) {
    setStatus(`Extract failed: ${(err as Error).message}`);
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function setStatus(msg: string): void {
  $<HTMLDivElement>("status").textContent = msg;
}

function wireUp(): void {
  // Add character
  $<HTMLButtonElement>("addChar").onclick = async () => {
    const nameInput = $<HTMLInputElement>("charName");
    const jobInput = $<HTMLInputElement>("charJob");
    const name = nameInput.value.trim();
    if (!name) return;
    await window.api.addCharacter({ name, job: jobInput.value.trim() || undefined });
    nameInput.value = "";
    jobInput.value = "";
    await refreshCharacters();
  };

  // Drag-drop + click-to-pick
  const drop = $<HTMLDivElement>("drop");
  const fileInput = $<HTMLInputElement>("file");
  drop.onclick = () => fileInput.click();
  fileInput.onchange = () => {
    if (fileInput.files?.[0]) handleFile(fileInput.files[0]);
  };
  drop.ondragover = (e) => {
    e.preventDefault();
    drop.classList.add("over");
  };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  // Save pending extraction to selected character + slot
  $<HTMLButtonElement>("save").onclick = async () => {
    if (!pending) return;
    const characterId = $<HTMLSelectElement>("character").value;
    const slot = $<HTMLSelectElement>("slot").value as EquipmentSlot;
    if (!characterId) {
      setStatus("Add/select a character first.");
      return;
    }
    await window.api.addEquipment({ characterId, slot, data: pending });
    pending = null;
    $<HTMLPreElement>("result").textContent = "";
    $<HTMLButtonElement>("save").disabled = true;
    setStatus("Saved.");
    await refreshCharacters();
  };
}

async function init(): Promise<void> {
  fillSlots();
  wireUp();
  await refreshEngines();
  await refreshCharacters();
}

init();
