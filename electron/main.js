import { app, BrowserWindow, Menu, ipcMain, Notification } from "electron";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, writeFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dev mode: --dev flag or WORKBENCH_DEV env
const isDev = process.argv.includes("--dev") || process.env.WORKBENCH_DEV === "1";

// Signal to server.js that Electron manages the lifecycle
process.env.ELECTRON = "1";

// Dev mode uses separate userData so both can run simultaneously
if (isDev) {
  app.setName("Claude Workbench Dev");
  app.setPath("userData", join(app.getPath("userData"), "-dev"));
}

// Store DB in Electron's userData directory
process.env.WORKBENCH_DB_PATH = join(app.getPath("userData"), "workbench.db");

let mainWindow = null;

// ── Window state persistence ──────────────────────────────────────
const stateFile = join(app.getPath("userData"), "window-state.json");

function loadWindowState() {
  try {
    return JSON.parse(readFileSync(stateFile, "utf-8"));
  } catch { return null; }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  const state = { ...bounds, isMaximized: win.isMaximized(), isFullScreen: win.isFullScreen() };
  try { writeFileSync(stateFile, JSON.stringify(state)); } catch {}
}

// Single instance lock (dev and stable get separate locks via different userData)
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

async function createWindow(url) {
  const savedState = loadWindowState();

  mainWindow = new BrowserWindow({
    width: savedState?.width ?? 1200,
    height: savedState?.height ?? 800,
    x: savedState?.x,
    y: savedState?.y,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#00000000",
    vibrancy: "under-window",
    visualEffectState: "active",
    title: isDev ? "Claude Workbench (Dev)" : "Claude Workbench",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (savedState?.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.loadURL(url);
  mainWindow.on("closed", () => { mainWindow = null; });

  // ── Debounced window state save on resize/move ────────────────
  let saveTimeout = null;
  const debouncedSave = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => saveWindowState(mainWindow), 300);
  };
  mainWindow.on("resize", debouncedSave);
  mainWindow.on("move", debouncedSave);
  mainWindow.on("close", () => saveWindowState(mainWindow));

  // Auto-open devtools in dev mode
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(async () => {
  // Dock badge IPC handler
  ipcMain.on("set-badge", (_event, count) => {
    if (process.platform === "darwin") {
      app.setBadgeCount(count);
    }
  });

  // Native notifications IPC handler
  ipcMain.on("show-notification", (_event, title, body) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  });

  // Setapp integration (optional)
  try {
    const setapp = await import("@anthropic-ai/setapp-framework");
    setapp.init();
  } catch {}

  if (isDev) {
    // Dev mode: connect to Vite dev server (which proxies /api to the stable backend)
    // Requires: pnpm start (backend) + pnpm dev (Vite) running separately
    const vitePort = 5173;
    try {
      await fetch(`http://localhost:${vitePort}/`);
      console.log(`Dev mode: using Vite at http://localhost:${vitePort}`);
    } catch {
      console.error("Dev mode requires Vite dev server running: pnpm dev");
      console.error("Also ensure backend is running: pnpm start");
    }
    createWindow(`http://localhost:${vitePort}`);
  } else {
    // Stable mode: start the Express server and serve built dist/
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

    createWindow(`http://localhost:${actualPort}`);
  }

  // macOS: re-create window when dock icon clicked
  let activeUrl = mainWindow?.webContents?.getURL?.() ?? `http://localhost:${isDev ? 5173 : 3232}`;
  // Track the actual URL once the window loads
  mainWindow?.webContents?.on("did-finish-load", () => {
    activeUrl = mainWindow?.webContents?.getURL?.() ?? activeUrl;
  });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(activeUrl);
    }
  });

  // macOS menu
  if (process.platform === "darwin") {
    const appLabel = isDev ? "Claude Workbench Dev" : app.name;
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: appLabel,
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
