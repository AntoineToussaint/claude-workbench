import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = join(__dirname, "..", "workbench.config.json");
const ENV_FILE = join(__dirname, "..", ".env");

export const COLORS = {
  blue:   { hex: "#3B82F6", bg: "#00101a" },
  green:  { hex: "#22C55E", bg: "#001a08" },
  red:    { hex: "#EF4444", bg: "#1a0400" },
  yellow: { hex: "#F59E0B", bg: "#1a1200" },
  black:  { hex: "#374151", bg: "#0d0d0d" },
  purple: { hex: "#A855F7", bg: "#0f0019" },
  orange: { hex: "#F97316", bg: "#1a0c00" },
  cyan:   { hex: "#06B6D4", bg: "#001a1a" },
};

export function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
}

// API key: process env > .env file
export function getAnthropicKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    if (existsSync(ENV_FILE)) {
      const line = readFileSync(ENV_FILE, "utf-8")
        .split("\n")
        .find((l) => l.startsWith("ANTHROPIC_API_KEY="));
      if (line) return line.split("=").slice(1).join("=").trim();
    }
  } catch {}
  return null;
}
