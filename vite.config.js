import { defineConfig } from "vite";
import { readFileSync, existsSync } from "fs";
import react from "@vitejs/plugin-react";

// Read server port from config (evaluated once at Vite startup)
let serverPort = 3232;
try {
  if (existsSync("workbench.config.json")) {
    const config = JSON.parse(readFileSync("workbench.config.json", "utf-8"));
    serverPort = config.port ?? 3232;
  }
} catch {}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": `http://localhost:${serverPort}` },
  },
});
