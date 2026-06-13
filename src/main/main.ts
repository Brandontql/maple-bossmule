import { app, BrowserWindow } from "electron";
import path from "path";
import { Store } from "../store/store";
import { registerIpc } from "./ipc";

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    title: "Maple BossMule — Equipment Tracker",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
  const store = new Store(path.join(app.getPath("userData"), "tracker.json"));
  registerIpc(store);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
