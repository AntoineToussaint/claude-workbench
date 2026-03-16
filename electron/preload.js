const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  setBadge: (count) => ipcRenderer.send("set-badge", count),
  isElectron: true,
});
