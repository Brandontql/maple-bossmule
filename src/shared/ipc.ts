import type { Character, EquipmentData, EquipmentSlot } from "./types";

/** IPC channel names, kept in one place so main and preload agree. */
export const Channels = {
  listEngines: "ocr:listEngines",
  setEngine: "ocr:setEngine",
  extract: "ocr:extract",
  getCharacters: "store:getCharacters",
  addCharacter: "store:addCharacter",
  addEquipment: "store:addEquipment",
} as const;

/** Payload for an extract request: base64-encoded image plus mime hint. */
export interface ExtractRequest {
  imageBase64: string;
  mimeType?: string;
}

export interface AddCharacterRequest {
  name: string;
  job?: string;
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
  addEquipment(req: AddEquipmentRequest): Promise<Character>;
}
