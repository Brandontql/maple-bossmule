import { ipcMain } from "electron";
import {
  extractEquipment,
  listEngines,
  setActiveEngine,
} from "../ocr";
import { Store } from "../store/store";
import { Channels } from "../shared/ipc";
import type {
  AddCharacterRequest,
  AddEquipmentRequest,
  ExtractRequest,
  UpdateCharacterRequest,
} from "../shared/ipc";
import type { EquipmentEntry } from "../shared/types";

/** Wire up all IPC handlers against the given store. */
export function registerIpc(store: Store): void {
  ipcMain.handle(Channels.listEngines, () => listEngines());

  ipcMain.handle(Channels.setEngine, (_evt, id: string) => {
    setActiveEngine(id);
  });

  ipcMain.handle(Channels.extract, (_evt, req: ExtractRequest) => {
    const image = Buffer.from(req.imageBase64, "base64");
    return extractEquipment({ image, mimeType: req.mimeType });
  });

  ipcMain.handle(Channels.getCharacters, () => store.getCharacters());

  ipcMain.handle(Channels.addCharacter, (_evt, req: AddCharacterRequest) =>
    store.addCharacter(req.name, req.job, req.mainStat),
  );

  ipcMain.handle(Channels.updateCharacter, (_evt, req: UpdateCharacterRequest) =>
    store.updateCharacter(req.characterId, req.mainStat),
  );

  ipcMain.handle(Channels.addEquipment, (_evt, req: AddEquipmentRequest) => {
    const entry: EquipmentEntry = {
      slot: req.slot,
      data: req.data,
      capturedAt: new Date().toISOString(),
    };
    return store.addEquipment(req.characterId, entry);
  });
}
