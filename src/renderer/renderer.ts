import type { TrackerApi } from "../shared/ipc";
import type { Character, EquipmentData, EquipmentEntry, EquipmentSlot, StatLine } from "../shared/types";
import { computeTotals, computeSetCounts } from "./compute.js";
import { tierColor, potentialPercents, toNum, SLOT_LAYOUT } from "./inventory.js";
import { isRelevantTotal } from "./inventory.js";
import { effectiveMainStat } from "./jobs.js";
import { countStars } from "./starcount.js";

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
    const ms = effectiveMainStat(c);
    const totals = computeTotals(c.equipment)
      .filter((t) => isRelevantTotal(t.key, ms))
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
  cell.title = d.name;
  cell.innerHTML =
    `<span class="pd-label">${slotLabel(slot)}</span>` +
    `<span class="pd-item">${escapeHtml(d.name)}</span>` +
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
  const editBtn = document.createElement("button");
  editBtn.className = "back-btn";
  editBtn.textContent = "Edit this item";
  editBtn.onclick = () => beginEdit(slot, d);
  panel.appendChild(editBtn);
}

/** Load a saved item into the editable preview so its values can be corrected
 *  and re-saved (overwrites that character + slot via the existing Save flow). */
function beginEdit(slot: string, d: EquipmentData): void {
  showPending(d);
  if (selectedCharacterId) {
    $<HTMLSelectElement>("character").value = selectedCharacterId;
  }
  $<HTMLSelectElement>("slot").value = slot;
  setStatus(`Editing ${slotLabel(slot)} — change values, then click "Save to character".`);
  $<HTMLDivElement>("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
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

  const ms = effectiveMainStat(c);
  const totals = computeTotals(c.equipment)
    .filter((t) => isRelevantTotal(t.key, ms))
    .slice(0, 4)
    .map((t) => `${t.key} ${t.isPercent ? `${t.total}%` : `+${t.total}`}`)
    .join(" · ");

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

  const bySlot = new Map<string, EquipmentEntry>();
  for (const e of c.equipment) bySlot.set(e.slot, e);

  const grid = document.createElement("div");
  grid.className = "paperdoll";

  const summary = document.createElement("div");
  summary.className = "pd-summary";
  summary.style.gridColumn = "3";
  summary.style.gridRow = "1 / 6";
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

/** Decode an image file to its pixels and a reusable bitmap, via canvas. */
async function decodeImage(
  file: File,
): Promise<{ pixels: Uint8ClampedArray; width: number; height: number; bitmap: ImageBitmap }> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0);
  const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { pixels: img.data, width: bitmap.width, height: bitmap.height, bitmap };
}

/** Upscaled, grayscaled, high-contrast, inverted PNG (base64) for Tesseract. */
function preprocessedBase64(bitmap: ImageBitmap): string {
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width * scale;
  canvas.height = bitmap.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.filter = "grayscale(1) contrast(160%) invert(1)";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png").split(",")[1];
}

async function handleFile(file: File): Promise<void> {
  setStatus("Reading image…");
  try {
    const { pixels, width, height, bitmap } = await decodeImage(file);
    const stars = countStars(pixels, width, height);

    const engine = $<HTMLSelectElement>("engine").value;
    let imageBase64: string;
    let mimeType: string;
    if (engine === "vision-llm") {
      const buf = await file.arrayBuffer();
      imageBase64 = arrayBufferToBase64(buf);
      mimeType = file.type || "image/png";
    } else {
      imageBase64 = preprocessedBase64(bitmap);
      mimeType = "image/png";
    }

    setStatus("Extracting…");
    const data = await window.api.extract({ imageBase64, mimeType });
    if (data.starForce == null && stars != null) {
      data.starForce = stars;
    }
    showPending(data);
    const starNote = stars != null ? ` (counted ★${stars})` : "";
    setStatus(`Extracted from ${file.name}${starNote}. Review, edit if needed, pick a slot, then Save.`);
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
    await window.api.addCharacter({
      name,
      job: jobInput.value.trim() || undefined,
      mainStat: $<HTMLSelectElement>("charMainStat").value || undefined,
    });
    nameInput.value = "";
    jobInput.value = "";
    $<HTMLSelectElement>("charMainStat").value = "";
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
