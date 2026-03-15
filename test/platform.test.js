import { describe, it, expect, afterEach } from "vitest";
import {
  commandExists,
  detectPlatform,
  resetPlatformCache,
  generateDefaultConfig,
  getTerminalSpawnArgs,
  getClipboardCommand,
  getFolderPickerCommand,
  getWindowFocusCommand,
  getHomebrewPrefix,
} from "../lib/platform.js";
import { loadConfig, saveConfig, isSetupComplete, COLORS } from "../lib/config.js";
import { getSetting, setSetting } from "../db.js";

afterEach(() => {
  resetPlatformCache();
});

describe("platform detection", () => {
  describe("commandExists", () => {
    it("should find a real command", () => {
      const result = commandExists("node");
      expect(result).toBeTruthy();
      expect(result).toContain("node");
    });

    it("should return null for a fake command", () => {
      expect(commandExists("definitely-not-a-real-command-xyz")).toBeNull();
    });
  });

  describe("detectPlatform", () => {
    it("should return a valid structure", () => {
      const p = detectPlatform();
      expect(p.os).toMatch(/^(darwin|linux)$/);
      expect(p.terminal).toHaveProperty("name");
      expect(p.terminal).toHaveProperty("bin");
      expect(typeof p.shell).toBe("string");
      expect(p.shell.length).toBeGreaterThan(0);
    });

    it("should cache the result", () => {
      const a = detectPlatform();
      const b = detectPlatform();
      expect(a).toBe(b); // same reference
    });

    it("should return fresh result after cache reset", () => {
      const a = detectPlatform();
      resetPlatformCache();
      const b = detectPlatform();
      expect(a).not.toBe(b); // different reference
      expect(a).toEqual(b); // same content
    });
  });

  describe("generateDefaultConfig", () => {
    it("should produce valid config from detected platform", () => {
      const platform = detectPlatform();
      const config = generateDefaultConfig(platform);

      expect(config.colors).toHaveLength(8);
      expect(config.port).toBe(3232);
      expect(Array.isArray(config.launchers)).toBe(true);

      // Should have at least a terminal launcher on any platform with a terminal
      if (platform.terminal.name !== "fallback") {
        const termLauncher = config.launchers.find((l) => l.type === "tmux-terminal");
        expect(termLauncher).toBeDefined();
        expect(termLauncher.panes).toHaveLength(2);
      }
    });

    it("should include editor launcher when editor is detected", () => {
      const platform = detectPlatform();
      if (platform.editor) {
        const config = generateDefaultConfig(platform);
        const editorLauncher = config.launchers.find((l) => l.type === "command");
        expect(editorLauncher).toBeDefined();
        expect(editorLauncher.cmd).toContain("{{path}}");
      }
    });
  });

  describe("getTerminalSpawnArgs", () => {
    it("should return ghostty config with configFile in cache dir", () => {
      const result = getTerminalSpawnArgs("ghostty", "/usr/bin/ghostty", "wb-test-blue", "Test", "#001122", true, "/bin/zsh");
      expect(result).not.toBeNull();
      expect(result.bin).toBe("/usr/bin/ghostty");
      expect(result.args[0]).toContain("--config-file=");
      expect(result.configFile).toContain(".cache/claude-workbench/");
      expect(result.configFile).toContain("wb-test-blue.conf");
      expect(result.configContent).toContain("background = #001122");
      expect(result.configContent).toContain("fullscreen = true");
    });

    it("should return kitty args", () => {
      const result = getTerminalSpawnArgs("kitty", "/usr/bin/kitty", "wb-test-blue", "Test", "#001122", false, "/bin/bash");
      expect(result.bin).toBe("/usr/bin/kitty");
      expect(result.args).toContain("--title");
    });

    it("should return alacritty args", () => {
      const result = getTerminalSpawnArgs("alacritty", "/usr/bin/alacritty", "wb-test-blue", "Test", "#001122", false, "/bin/bash");
      expect(result.args).toContain("--title");
      expect(result.args).toContain("-e");
    });

    it("should return gnome-terminal args", () => {
      const result = getTerminalSpawnArgs("gnome-terminal", "/usr/bin/gnome-terminal", "wb-test-blue", "Test", "#001122", false, "/bin/bash");
      expect(result.args).toContain("--");
    });

    it("should return xterm args", () => {
      const result = getTerminalSpawnArgs("xterm", "/usr/bin/xterm", "wb-test-blue", "Test", "#001122", false, "/bin/bash");
      expect(result.args).toContain("-e");
    });

    it("should return null for unknown terminal", () => {
      const result = getTerminalSpawnArgs("unknown-terminal", "/usr/bin/unknown", "wb-test-blue", "Test", "#001122", false, "/bin/bash");
      expect(result).toBeNull();
    });

    it("should return iterm2 args with postSpawnScript", () => {
      const result = getTerminalSpawnArgs("iterm2", "/Applications/iTerm.app", "wb-test-blue", "Test", "#001122", false, "/bin/bash");
      expect(result.bin).toBe("open");
      expect(result.postSpawnScript).toContain("osascript");
    });

    it("should return terminal.app args with postSpawnScript", () => {
      const result = getTerminalSpawnArgs("terminal.app", "/System/Applications/Utilities/Terminal.app", "wb-test-blue", "Test", "#001122", false, "/bin/bash");
      expect(result.bin).toBe("open");
      expect(result.postSpawnScript).toContain("osascript");
    });

    it("should only include macos-non-native-fullscreen on darwin", () => {
      const result = getTerminalSpawnArgs("ghostty", "/usr/bin/ghostty", "wb-test-blue", "Test", "#001122", true, "/bin/bash");
      if (process.platform === "darwin") {
        expect(result.configContent).toContain("macos-non-native-fullscreen");
      } else {
        expect(result.configContent).not.toContain("macos-non-native-fullscreen");
      }
    });
  });

  describe("getClipboardCommand", () => {
    it("should return a string on macOS or null on headless Linux", () => {
      const cmd = getClipboardCommand();
      if (process.platform === "darwin") {
        expect(cmd).toBe("pbcopy");
      } else {
        // On Linux, may be null if no clipboard tool installed
        expect(cmd === null || typeof cmd === "string").toBe(true);
      }
    });
  });

  describe("getFolderPickerCommand", () => {
    it("should return a command string on supported platforms", () => {
      const cmd = getFolderPickerCommand("Pick a folder");
      if (process.platform === "darwin") {
        expect(cmd).toContain("osascript");
        expect(cmd).toContain("Pick a folder");
      } else {
        // May be null if no picker available
        expect(cmd === null || typeof cmd === "string").toBe(true);
      }
    });
  });

  describe("getWindowFocusCommand", () => {
    it("should return a command string on supported platforms", () => {
      const cmd = getWindowFocusCommand(12345);
      if (process.platform === "darwin") {
        expect(cmd).toContain("12345");
        expect(cmd).toContain("osascript");
      } else {
        expect(cmd === null || typeof cmd === "string").toBe(true);
      }
    });
  });

  describe("getHomebrewPrefix", () => {
    it("should return a path on macOS or null on Linux", () => {
      const prefix = getHomebrewPrefix();
      if (process.platform === "darwin") {
        expect(prefix).toMatch(/\/(opt\/homebrew|usr\/local)\/bin/);
      } else {
        expect(prefix).toBeNull();
      }
    });
  });
});

describe("config (SQLite)", () => {
  it("should save and load config from SQLite", () => {
    const testConfig = { colors: ["blue", "red"], port: 4000, launchers: [] };
    saveConfig(testConfig);
    const loaded = loadConfig();
    expect(loaded).toEqual(testConfig);
  });

  it("should report setup as complete after saving", () => {
    saveConfig({ colors: ["blue"], port: 3232, launchers: [] });
    expect(isSetupComplete()).toBe(true);
  });

  it("should handle null-safe port access on config", () => {
    // Simulate what bin/claude-workbench.js does
    const config = null;
    const port = config?.port ?? 3232;
    expect(port).toBe(3232);
  });

  it("COLORS should have valid hex values with # prefix", () => {
    for (const [name, def] of Object.entries(COLORS)) {
      expect(def.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(def.bg).toMatch(/^#[0-9A-Fa-f]{6}$/);
      // Verify hex parsing doesn't crash
      const matches = def.hex.replace("#", "").match(/\w{2}/g);
      expect(matches).toHaveLength(3);
      const [r, g, b] = matches.map((h) => parseInt(h, 16));
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(255);
    }
  });

  it("should handle malformed hex gracefully", () => {
    // Simulates what environments.js objective endpoint does
    // Short hex like #888 only has 1 pair match, fallback kicks in
    const badHex = "#888";
    const rawMatches = badHex.replace("#", "").match(/\w{2}/g);
    expect(rawMatches).toHaveLength(1); // only "88" matched
    const safeMatches = rawMatches?.length === 3 ? rawMatches : ["88", "88", "88"];
    expect(safeMatches).toHaveLength(3);

    // Good hex works normally
    const goodHex = "#3B82F6";
    const goodMatches = goodHex.replace("#", "").match(/\w{2}/g);
    expect(goodMatches).toHaveLength(3);
  });

  it("generateDefaultConfig port should be 3232", () => {
    const platform = detectPlatform();
    const config = generateDefaultConfig(platform);
    expect(config.port).toBe(3232);
  });
});
