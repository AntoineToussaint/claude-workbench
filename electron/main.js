import { app, BrowserWindow, Menu } from "electron";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Signal to server.js that Electron manages the lifecycle
process.env.ELECTRON = "1";

// Store DB in Electron's userData directory
process.env.WORKBENCH_DB_PATH = join(app.getPath("userData"), "workbench.db");

let mainWindow = null;

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

async function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0f0f0f",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://localhost:${port}`);
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  // Setapp integration (optional)
  try {
    const setapp = await import("@anthropic-ai/setapp-framework");
    setapp.init();
  } catch {}

  // Import and start the server
  const { app: server, loadConfig } = await import("../server.js");
  const config = loadConfig();
  const port = config?.port ?? 3232;

  const actualPort = await new Promise((resolve, reject) => {
    const s = server.listen(port, () => {
      console.log(`Workbench server on port ${port}`);
      resolve(port);
    });
    s.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        // Port busy — let OS pick a free one
        const s2 = server.listen(0, () => {
          const freePort = s2.address().port;
          console.log(`Port ${port} in use, using ${freePort}`);
          resolve(freePort);
        });
        s2.on("error", reject);
      } else {
        reject(err);
      }
    });
  });

  createWindow(actualPort);

  // macOS: re-create window when dock icon clicked
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(actualPort);
  });

  // macOS menu
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
      { label: "View", submenu: [{ role: "reload" }, { role: "forceReload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
      { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }] },
    ]));
  }
});

// Note: tmux sessions are intentionally kept alive on quit —
// they hold the user's active work and Claude Code instances.

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
