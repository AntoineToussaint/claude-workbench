const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  setBadge: (count) => ipcRenderer.send("set-badge", count),
  showNotification: (title, body) => ipcRenderer.send("show-notification", title, body),
  isElectron: true,
});
