import type { TrackerApi } from "../shared/ipc";
import type { Character, EquipmentData, EquipmentSlot } from "../shared/types";
import type { StatLine } from "../shared/types";
import { computeTotals, computeSetCounts } from "./compute.js";

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
