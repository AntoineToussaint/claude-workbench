import express from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadConfig, COLORS } from "./lib/config.js";
import { listRepos, getSetting, setSetting } from "./db.js";
import repoRoutes from "./routes/repos.js";
import envRoutes from "./routes/environments.js";
import githubRoutes from "./routes/github.js";
import launcherRoutes from "./routes/launchers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Strip Claude Code env vars so spawned terminals are clean
delete process.env.CLAUDECODE;
delete process.env.ANTHROPIC_API_KEY;

// Ensure homebrew binaries are available (macOS only)
import { getHomebrewPrefix, commandExists } from "./lib/platform.js";
const brewPrefix = getHomebrewPrefix();
if (brewPrefix) {
  process.env.PATH = `${brewPrefix}:${process.env.PATH}`;
}

// Check required dependencies on startup
const missingDeps = [];
if (!commandExists("tmux")) missingDeps.push("tmux");
if (!commandExists("gh")) missingDeps.push("gh (GitHub CLI)");
if (missingDeps.length > 0) {
  const installHint = process.platform === "darwin" ? `brew install ${missingDeps.map(d => d.split(" ")[0]).join(" ")}` : `apt install ${missingDeps.map(d => d.split(" ")[0]).join(" ")}`;
  console.warn(`\n⚠  Missing dependencies: ${missingDeps.join(", ")}`);
  console.warn(`   Install with: ${installHint}\n`);
}

const app = express();
app.use(express.json());

// ── Config endpoint ─────────────────────────────────────────────────────────

app.get("/api/config", (_req, res) => {
  const config = loadConfig();
  const colors = (config.colors ?? Object.keys(COLORS)).map((name) => ({
    name,
    ...(COLORS[name] ?? { hex: "#888", bg: "#111" }),
  }));
  res.json({ ...config, colors, repos: listRepos() });
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

// ── Route modules ───────────────────────────────────────────────────────────

app.use("/api", repoRoutes);
app.use("/api", envRoutes);
app.use("/api", githubRoutes);
app.use("/api", launcherRoutes);

// ── Static files ────────────────────────────────────────────────────────────

app.use(express.static(join(__dirname, "dist")));
app.get("*", (_req, res) => res.sendFile(join(__dirname, "dist", "index.html")));

export { app, loadConfig, COLORS };

// Only listen when run directly (not imported by tests)
const isMainModule = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^\//, ""));
if (isMainModule || !process.env.VITEST) {
  const config = loadConfig();
  const port = config.port ?? 3131;
  app.listen(port, () => {
    console.log(`Claude Workbench running on http://localhost:${port}`);
  });
}
