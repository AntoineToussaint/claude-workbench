import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

let _cached = null;

/**
 * Check if a command exists on PATH. Returns its path or null.
 */
export function commandExists(name) {
  try {
    return execSync(`which ${name} 2>/dev/null`, { encoding: "utf-8" }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Detect the current platform capabilities. Result is cached.
 */
export function detectPlatform() {
  if (_cached) return _cached;

  const os = process.platform === "darwin" ? "darwin" : "linux";
  const terminal = detectTerminal(os);
  const clipboard = detectClipboard(os);
  const editor = detectEditor();
  const shell = process.env.SHELL || "/bin/bash";
  const windowFocus = detectWindowFocus(os);
  const folderPicker = detectFolderPicker(os);

  _cached = { os, terminal, clipboard, editor, shell, windowFocus, folderPicker };
  return _cached;
}

/** Reset the cache (for testing). */
export function resetPlatformCache() {
  _cached = null;
}

function detectTerminal(os) {
  if (os === "darwin") {
    // iTerm2: preferred terminal
    if (existsSync("/Applications/iTerm.app"))
      return { name: "iterm2", bin: "/Applications/iTerm.app" };

    // Ghostty: check PATH first, then .app bundle
    const ghosttyPath = commandExists("ghostty");
    if (ghosttyPath) return { name: "ghostty", bin: ghosttyPath };
    if (existsSync("/Applications/Ghostty.app/Contents/MacOS/ghostty"))
      return { name: "ghostty", bin: "/Applications/Ghostty.app/Contents/MacOS/ghostty" };

    for (const t of ["kitty", "alacritty"]) {
      const bin = commandExists(t);
      if (bin) return { name: t, bin };
    }

    // Terminal.app always available
    return { name: "terminal.app", bin: "/System/Applications/Utilities/Terminal.app" };
  }

  // Linux
  for (const t of ["ghostty", "kitty", "alacritty", "gnome-terminal", "xterm"]) {
    const bin = commandExists(t);
    if (bin) return { name: t, bin };
  }

  return { name: "fallback", bin: null };
}

function detectClipboard(os) {
  if (os === "darwin") return "pbcopy";
  if (process.env.WAYLAND_DISPLAY) {
    const wl = commandExists("wl-copy");
    if (wl) return "wl-copy";
  }
  return commandExists("xclip") ? "xclip -selection clipboard" : commandExists("xsel") ? "xsel --clipboard --input" : null;
}

function detectEditor() {
  for (const e of ["zed", "cursor", "code"]) {
    if (commandExists(e)) return e;
  }
  return null;
}

function detectWindowFocus(os) {
  if (os === "darwin") return "osascript";
  return commandExists("xdotool") ? "xdotool" : commandExists("wmctrl") ? "wmctrl" : null;
}

function detectFolderPicker(os) {
  if (os === "darwin") return "osascript";
  return commandExists("zenity") ? "zenity" : commandExists("kdialog") ? "kdialog" : null;
}

// ── Terminal spawn strategies ────────────────────────────────────────────────

const TERMINAL_STRATEGIES = {
  ghostty: (bin, session, title, bgColor, fullscreen, shell, attachCommand) => {
    if (process.platform === "darwin") {
      // macOS: must use `open -na Ghostty.app --args` — CLI launch not supported
      const args = ["-na", "Ghostty.app", "--args",
        `--command=${shell} -c "exec ${attachCommand}"`,
        `--background=${bgColor}`,
        `--title=${title}`,
        `--window-decoration=true`,
        `--window-save-state=never`,
        `--confirm-close-surface=false`,
        `--keybind=super+n=new_window`,
      ];
      if (fullscreen) {
        args.push(`--fullscreen=true`, `--macos-non-native-fullscreen=true`);
      }
      return { bin: "open", args };
    }
    // Linux: direct CLI works
    const cacheDir = join(homedir(), ".cache", "claude-workbench");
    mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
    const configPath = join(cacheDir, `${session}.conf`);
    const lines = [
      `command = ${shell} -c "exec ${attachCommand}"`,
      `background = ${bgColor}`,
      `title = ${title}`,
      `window-decoration = true`,
      `window-save-state = never`,
      `confirm-close-surface = false`,
    ];
    if (fullscreen) lines.push(`fullscreen = true`);
    return { bin, args: [`--config-file=${configPath}`], configFile: configPath, configContent: lines.join("\n") + "\n" };
  },

  kitty: (bin, session, title, bgColor, _fullscreen, _shell, attachCommand) => {
    const parts = attachCommand.split(" ");
    return {
      bin,
      args: ["--title", title, "-o", `background=${bgColor}`, ...parts],
    };
  },

  alacritty: (bin, session, title, _bgColor, _fullscreen, _shell, attachCommand) => {
    const parts = attachCommand.split(" ");
    return {
      bin,
      args: ["--title", title, "-e", ...parts],
    };
  },

  "gnome-terminal": (bin, session, title, _bgColor, _fullscreen, _shell, attachCommand) => {
    const parts = attachCommand.split(" ");
    return {
      bin,
      args: [`--title=${title}`, "--", ...parts],
    };
  },

  xterm: (bin, session, title, _bgColor, _fullscreen, _shell, attachCommand) => {
    const parts = attachCommand.split(" ");
    return {
      bin,
      args: ["-title", title, "-e", ...parts],
    };
  },

  iterm2: (_bin, session, _title, _bgColor, _fullscreen, _shell, attachCommand) => ({
    bin: "open",
    args: ["-a", "iTerm"],
    postSpawnScript: `osascript -e 'tell application "iTerm" to tell current session of current window to write text "${attachCommand}"'`,
  }),

  "terminal.app": (_bin, session, _title, _bgColor, _fullscreen, _shell, attachCommand) => ({
    bin: "open",
    args: ["-a", "Terminal"],
    postSpawnScript: `osascript -e 'tell application "Terminal" to do script "${attachCommand}" in front window'`,
  }),
};

/**
 * Get spawn arguments for a given terminal.
 * Returns { bin, args, configFile?, configContent?, postSpawnScript? } or null for fallback.
 * @param {string} attachCommand - The command to attach to the multiplexer session (default: tmux attach -t session)
 */
export function getTerminalSpawnArgs(terminalName, bin, session, title, bgColor, fullscreen, shell, attachCommand) {
  const strategy = TERMINAL_STRATEGIES[terminalName];
  if (!strategy) return null;
  const resolvedAttach = attachCommand || `tmux attach -t ${session}`;
  return strategy(bin, session, title, bgColor, fullscreen, shell || process.env.SHELL || "/bin/bash", resolvedAttach);
}

/**
 * Get the clipboard copy command string, or null if unavailable.
 */
export function getClipboardCommand() {
  const { clipboard } = detectPlatform();
  return clipboard;
}

/**
 * Get an executable command string to focus a window by PID, or null.
 */
export function getWindowFocusCommand(pid) {
  const { os, windowFocus } = detectPlatform();
  if (!windowFocus) return null;
  if (os === "darwin") {
    return `osascript -e 'tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true'`;
  }
  if (windowFocus === "xdotool") {
    return `xdotool search --pid ${pid} windowactivate`;
  }
  if (windowFocus === "wmctrl") {
    return `wmctrl -i -a $(wmctrl -lp | awk '$3 == ${pid} {print $1; exit}')`;
  }
  return null;
}

/**
 * Get an executable command string to show a folder picker dialog, or null.
 */
export function getFolderPickerCommand(prompt) {
  const { os, folderPicker } = detectPlatform();
  if (!folderPicker) return null;
  if (os === "darwin") {
    return `osascript -e 'POSIX path of (choose folder with prompt "${prompt}")'`;
  }
  if (folderPicker === "zenity") {
    return `zenity --file-selection --directory --title="${prompt}"`;
  }
  if (folderPicker === "kdialog") {
    return `kdialog --getexistingdirectory . --title "${prompt}"`;
  }
  return null;
}

/**
 * Generate a default workbench config based on detected platform.
 */
export function generateDefaultConfig(platform) {
  const launchers = [];

  // Terminal launcher (mux-terminal supports tmux, cmux, and none backends)
  if (platform.terminal.name !== "fallback") {
    launchers.push({
      id: platform.terminal.name === "terminal.app" ? "terminal" : platform.terminal.name,
      label: terminalLabel(platform.terminal.name),
      icon: "terminal",
      type: "mux-terminal",
      app: platform.terminal.bin,
      fullscreen: platform.terminal.name === "ghostty",
      panes: [
        { cmd: "claude", focus: true },
        { cmd: null },
      ],
    });
  }

  // Editor launcher
  if (platform.editor) {
    const editorLabels = { zed: "Zed", cursor: "Cursor", code: "VS Code" };
    launchers.push({
      id: platform.editor,
      label: editorLabels[platform.editor] ?? platform.editor,
      icon: "editor",
      type: "command",
      cmd: `${platform.editor} "{{path}}"`,
    });
  }

  return {
    colors: ["blue", "green", "red", "yellow", "black", "purple", "orange", "cyan"],
    port: 3232,
    launchers,
  };
}

function terminalLabel(name) {
  const labels = {
    ghostty: "Ghostty",
    kitty: "Kitty",
    alacritty: "Alacritty",
    "gnome-terminal": "Terminal",
    xterm: "XTerm",
    iterm2: "iTerm",
    "terminal.app": "Terminal",
  };
  return labels[name] ?? name;
}

/**
 * Get the Homebrew prefix for the current platform, or null.
 */
export function getHomebrewPrefix() {
  if (process.platform !== "darwin") return null;
  // Apple Silicon vs Intel
  if (existsSync("/opt/homebrew/bin")) return "/opt/homebrew/bin";
  if (existsSync("/usr/local/bin")) return "/usr/local/bin";
  return null;
}
