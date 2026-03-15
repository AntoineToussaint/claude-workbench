#!/usr/bin/env node

import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync, fork } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Auto-generate config if needed (importing triggers auto-generation via config.js)
const { loadConfig } = await import(join(ROOT, "lib", "config.js"));

// Build frontend if dist/ doesn't exist
const distDir = join(ROOT, "dist");
if (!existsSync(distDir)) {
  console.log("Building frontend (first run)...");
  try {
    execSync("npm run build", { cwd: ROOT, stdio: "inherit" });
  } catch {
    console.error("Build failed. Run `npm run build` manually.");
    process.exit(1);
  }
}

// Start the server
const config = loadConfig();
const port = config?.port ?? 3232;
const url = `http://localhost:${port}`;

console.log(`Starting Claude Workbench on ${url}`);

const server = fork(join(ROOT, "server.js"), [], { cwd: ROOT, stdio: "inherit" });

// Poll until the server is ready, then open browser
async function waitAndOpen() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const openCmd = process.platform === "darwin"
          ? `open ${url}`
          : `xdg-open ${url} 2>/dev/null`;
        try { execSync(openCmd, { stdio: "ignore" }); } catch {}
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`Server didn't respond in time. Open ${url} manually.`);
}
waitAndOpen();

// Forward signals
process.on("SIGINT", () => { server.kill("SIGINT"); process.exit(0); });
process.on("SIGTERM", () => { server.kill("SIGTERM"); process.exit(0); });
