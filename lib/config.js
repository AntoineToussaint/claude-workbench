import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getSetting, setSetting } from "../db.js";
import { detectPlatform, generateDefaultConfig } from "./platform.js";

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
  pink:   { hex: "#EC4899", bg: "#1a0010" },
  teal:   { hex: "#14B8A6", bg: "#001a16" },
  indigo: { hex: "#6366F1", bg: "#0a0019" },
  lime:   { hex: "#84CC16", bg: "#0f1a00" },
  rose:   { hex: "#F43F5E", bg: "#1a0008" },
  sky:    { hex: "#0EA5E9", bg: "#001019" },
  amber:  { hex: "#D97706", bg: "#1a1000" },
  violet: { hex: "#8B5CF6", bg: "#0d0019" },
};

/**
 * Generate a new color slot with a unique name and hue.
 * Used when all predefined colors are exhausted.
 */
export function generateColor(existingNames) {
  const taken = new Set(existingNames);
  // Try predefined colors first
  for (const name of Object.keys(COLORS)) {
    if (!taken.has(name)) return { name, ...COLORS[name] };
  }
  // Generate numbered slots with evenly-spaced hues
  let i = 1;
  while (taken.has(`slot-${i}`)) i++;
  const hue = (i * 137.5) % 360; // golden angle for good distribution
  const hex = hslToHex(hue, 70, 55);
  const bg = hslToHex(hue, 40, 5);
  return { name: `slot-${i}`, hex, bg };
}

/**
 * Get or generate color definition for a given name.
 * Returns { name, hex, bg } — uses predefined COLORS if available,
 * otherwise generates deterministically from the name.
 */
export function colorForName(name) {
  if (COLORS[name]) return { name, ...COLORS[name] };
  // Deterministic hue from slot number or name hash
  const num = name.startsWith("slot-") ? parseInt(name.slice(5)) : hashCode(name);
  const hue = (num * 137.5) % 360;
  return { name, hex: hslToHex(hue, 70, 55), bg: hslToHex(hue, 40, 5) };
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Load config from SQLite settings → JSON file fallback → auto-detect.
 * SQLite is the source of truth once setup is complete.
 */
export function loadConfig() {
  // 1. Try SQLite
  const stored = getSetting("config", null);
  if (stored) {
    try { return JSON.parse(stored); }
    catch { /* corrupted — fall through */ }
  }

  // 2. Try JSON file (migration path — import into SQLite)
  if (existsSync(CONFIG_FILE)) {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
      setSetting("config", JSON.stringify(config));
      return config;
    } catch { /* corrupted — fall through */ }
  }

  // 3. No config at all — return null (triggers setup wizard)
  return null;
}

/**
 * Save config to SQLite.
 */
export function saveConfig(config) {
  setSetting("config", JSON.stringify(config));
}

/**
 * Check if setup has been completed.
 */
export function isSetupComplete() {
  return loadConfig() !== null;
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
