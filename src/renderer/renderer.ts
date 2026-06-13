import type { TrackerApi } from "../shared/ipc";
import type { Character, EquipmentData, EquipmentSlot } from "../shared/types";

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
    } else {
      for (const entry of c.equipment) {
        const row = document.createElement("div");
        row.className = "equip";
        const sf = entry.data.starForce != null ? `★${entry.data.starForce} ` : "";
        const tier = entry.data.potential.tier ? ` [${entry.data.potential.tier}]` : "";
        const statText = entry.data.stats.map((s) => s.raw).join(", ");
        row.innerHTML =
          `<b>${entry.slot}</b>: ${sf}${escapeHtml(entry.data.name)}${tier}` +
          `<br><span class="muted">${escapeHtml(statText)}</span>`;
        card.appendChild(row);
      }
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
  out.textContent = JSON.stringify(data, null, 2);
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
