import express from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadConfig, saveConfig, COLORS, generateColor, colorForName } from "./lib/config.js";
import { db, listRepos, listEnvironments as dbListEnvironments, getSetting, setSetting } from "./db.js";
import repoRoutes from "./routes/repos.js";
import envRoutes from "./routes/environments.js";
import githubRoutes from "./routes/github.js";
import launcherRoutes from "./routes/launchers.js";
import webhookRoutes from "./routes/webhooks.js";
import { detectMultiplexer, getMultiplexer } from "./lib/multiplexer/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Strip Claude Code env vars so spawned terminals are clean
delete process.env.CLAUDECODE;
delete process.env.ANTHROPIC_API_KEY;

// Ensure homebrew binaries are available (macOS only)
import { getHomebrewPrefix, commandExists, detectPlatform, generateDefaultConfig } from "./lib/platform.js";
const brewPrefix = getHomebrewPrefix();
if (brewPrefix) {
  process.env.PATH = `${brewPrefix}:${process.env.PATH}`;
}

// Check required dependencies on startup
const missingDeps = [];
const detectedMux = detectMultiplexer();
if (detectedMux === "none") missingDeps.push("tmux (or cmux)");
if (!commandExists("gh")) missingDeps.push("gh (GitHub CLI)");
if (missingDeps.length > 0) {
  const installHint = process.platform === "darwin" ? `brew install ${missingDeps.map(d => d.split(" ")[0]).join(" ")}` : `apt install ${missingDeps.map(d => d.split(" ")[0]).join(" ")}`;
  console.warn(`\n⚠  Missing dependencies: ${missingDeps.join(", ")}`);
  console.warn(`   Install with: ${installHint}\n`);
}

const app = express();
app.use(express.json());

// ── Config endpoint ─────────────────────────────────────────────────────────

app.get("/api/config", async (_req, res) => {
  const config = loadConfig();
  if (!config) return res.json({ setupRequired: true });

  const colors = Object.keys(COLORS).map((name) => ({
    name,
    ...COLORS[name],
  }));

  // Include dynamically-generated colors for active environments using non-predefined names
  const activeEnvs = dbListEnvironments();
  for (const colorName of Object.keys(activeEnvs)) {
    if (!COLORS[colorName]) {
      colors.push(colorForName(colorName));
    }
  }

  // Auto-detect launchers if none configured or if any reference missing commands
  let { launchers } = config;
  const needsRedetect = !launchers || launchers.length === 0 || launchers.some((l) => {
    if (l.type === "command" && l.cmd) {
      const bin = l.cmd.split(/\s/)[0];
      return !commandExists(bin);
    }
    return false;
  });
  if (needsRedetect) {
    const defaults = generateDefaultConfig(detectPlatform());
    launchers = defaults.launchers;
    saveConfig({ ...config, launchers });
  }

  const muxOverride = config.multiplexer ?? "auto";
  const muxType = muxOverride === "auto" ? detectMultiplexer() : muxOverride;
  let muxCapabilities = { stateDetection: false, notifications: false, embeddedBrowser: false, splitPanes: false };
  try {
    const mux = await getMultiplexer(muxOverride);
    muxCapabilities = mux.getCapabilities();
  } catch {}

  res.json({ ...config, launchers, colors, repos: listRepos(), missingDeps, multiplexer: { type: muxType, capabilities: muxCapabilities } });
});

// ── Setup wizard ────────────────────────────────────────────────────────────

app.get("/api/setup/detect", (_req, res) => {
  const platform = detectPlatform();
  const defaults = generateDefaultConfig(platform);
  const muxType = detectMultiplexer();
  res.json({
    platform,
    defaults,
    allColors: Object.keys(COLORS),
    missingDeps,
    multiplexer: muxType,
  });
});

app.post("/api/setup/reset", (_req, res) => {
  // Remove config from settings to trigger setup wizard
  db.prepare("DELETE FROM settings WHERE key = 'config'").run();
  res.json({ ok: true });
});

app.post("/api/setup", (req, res) => {
  const { port, launchers } = req.body;
  const config = {
    port: port ?? 3232,
    launchers: launchers ?? [],
  };
  saveConfig(config);
  res.json({ ok: true });
});

app.put("/api/config", (req, res) => {
  const current = loadConfig() ?? {};
  const updated = { ...current, ...req.body };
  saveConfig(updated);
  res.json({ ok: true });
});

// ── Layout order persistence ────────────────────────────────────────────────

app.get("/api/layout", (_req, res) => {
  const cardOrder = getSetting("cardOrder", null);
  const sectionOrder = getSetting("sectionOrder", null);
  res.json({
    cardOrder: cardOrder ? JSON.parse(cardOrder) : null,
    sectionOrder: sectionOrder ? JSON.parse(sectionOrder) : null,
  });
});

app.put("/api/layout", (req, res) => {
  const { cardOrder, sectionOrder } = req.body;
  if (cardOrder !== undefined) setSetting("cardOrder", JSON.stringify(cardOrder));
  if (sectionOrder !== undefined) setSetting("sectionOrder", JSON.stringify(sectionOrder));
  res.json({ ok: true });
});

// ── Generate next available color ────────────────────────────────────────────

app.post("/api/colors/next", (_req, res) => {
  const usedColors = Object.keys(dbListEnvironments());
  const newColor = generateColor(usedColors);
  res.json(newColor);
});

// ── Route modules ───────────────────────────────────────────────────────────

app.use("/api", repoRoutes);
app.use("/api", envRoutes);
app.use("/api", githubRoutes);
app.use("/api", launcherRoutes);
app.use("/api", webhookRoutes);

// ── Static files ────────────────────────────────────────────────────────────

app.use(express.static(join(__dirname, "dist")));
app.get("*", (_req, res) => res.sendFile(join(__dirname, "dist", "index.html")));

export { app, loadConfig, COLORS };

// Only listen when run directly (not imported by tests)
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^\//, ""));
if ((isMainModule || !process.env.VITEST) && !process.env.ELECTRON) {
  const config = loadConfig();
  const port = config?.port ?? 3232;
  app.listen(port, () => {
    console.log(`Claude Workbench running on http://localhost:${port}`);
  });
}
