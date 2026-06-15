import type { Character, EquipmentData, EquipmentSlot } from "./types";

/**
 * IPC channel names, kept in one place so main and preload agree.
 *
 * Declared as a `const enum` so each `Channels.x` access inlines to its string
 * literal at compile time and NO runtime object is emitted. This is deliberate:
 * `shared/ipc.ts` is compiled by both the main build (CommonJS) and the renderer
 * build (ES modules) into the same `dist/shared/ipc.js`. A runtime `export const`
 * would be re-emitted as an ES-module `export` by the renderer build and break the
 * main process's CommonJS `require`. With no runtime emit, that collision is moot.
 */
export const enum Channels {
  listEngines = "ocr:listEngines",
  setEngine = "ocr:setEngine",
  extract = "ocr:extract",
  getCharacters = "store:getCharacters",
  addCharacter = "store:addCharacter",
  updateCharacter = "store:updateCharacter",
  addEquipment = "store:addEquipment",
}

/** Payload for an extract request: base64-encoded image plus mime hint. */
export interface ExtractRequest {
  imageBase64: string;
  mimeType?: string;
}

export interface AddCharacterRequest {
  name: string;
  job?: string;
  mainStat?: string;
}

export interface UpdateCharacterRequest {
  characterId: string;
  mainStat?: string;
}

export interface AddEquipmentRequest {
  characterId: string;
  slot: EquipmentSlot;
  data: EquipmentData;
}

/** The surface exposed to the renderer via the preload bridge. */
export interface TrackerApi {
  listEngines(): Promise<{ id: string; label: string }[]>;
  setEngine(id: string): Promise<void>;
  extract(req: ExtractRequest): Promise<EquipmentData>;
  getCharacters(): Promise<Character[]>;
  addCharacter(req: AddCharacterRequest): Promise<Character>;
  updateCharacter(req: UpdateCharacterRequest): Promise<Character>;
  addEquipment(req: AddEquipmentRequest): Promise<Character>;
}
