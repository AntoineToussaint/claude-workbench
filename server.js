import express from "express";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadConfig, COLORS } from "./lib/config.js";
import { listRepos } from "./db.js";
import repoRoutes from "./routes/repos.js";
import envRoutes from "./routes/environments.js";
import githubRoutes from "./routes/github.js";
import launcherRoutes from "./routes/launchers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Strip Claude Code env vars so spawned terminals are clean
delete process.env.CLAUDECODE;
delete process.env.ANTHROPIC_API_KEY;

// Ensure homebrew binaries are available
process.env.PATH = `/opt/homebrew/bin:${process.env.PATH}`;

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
