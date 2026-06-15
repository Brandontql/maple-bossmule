import { contextBridge, ipcRenderer } from "electron";
import { Channels } from "../shared/ipc";
import type {
  AddCharacterRequest,
  AddEquipmentRequest,
  ExtractRequest,
  TrackerApi,
  UpdateCharacterRequest,
} from "../shared/ipc";

const api: TrackerApi = {
  listEngines: () => ipcRenderer.invoke(Channels.listEngines),
  setEngine: (id: string) => ipcRenderer.invoke(Channels.setEngine, id),
  extract: (req: ExtractRequest) => ipcRenderer.invoke(Channels.extract, req),
  getCharacters: () => ipcRenderer.invoke(Channels.getCharacters),
  addCharacter: (req: AddCharacterRequest) =>
    ipcRenderer.invoke(Channels.addCharacter, req),
  updateCharacter: (req: UpdateCharacterRequest) =>
    ipcRenderer.invoke(Channels.updateCharacter, req),
  addEquipment: (req: AddEquipmentRequest) =>
    ipcRenderer.invoke(Channels.addEquipment, req),
};

contextBridge.exposeInMainWorld("api", api);
