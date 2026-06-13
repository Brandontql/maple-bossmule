import { contextBridge, ipcRenderer } from "electron";
import { Channels } from "../shared/ipc";
import type {
  AddCharacterRequest,
  AddEquipmentRequest,
  ExtractRequest,
  TrackerApi,
} from "../shared/ipc";

const api: TrackerApi = {
  listEngines: () => ipcRenderer.invoke(Channels.listEngines),
  setEngine: (id: string) => ipcRenderer.invoke(Channels.setEngine, id),
  extract: (req: ExtractRequest) => ipcRenderer.invoke(Channels.extract, req),
  getCharacters: () => ipcRenderer.invoke(Channels.getCharacters),
  addCharacter: (req: AddCharacterRequest) =>
    ipcRenderer.invoke(Channels.addCharacter, req),
  addEquipment: (req: AddEquipmentRequest) =>
    ipcRenderer.invoke(Channels.addEquipment, req),
};

contextBridge.exposeInMainWorld("api", api);
