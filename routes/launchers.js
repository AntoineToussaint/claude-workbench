import { Router } from "express";
import { exec, spawn } from "child_process";
import { writeFileSync } from "fs";
import { basename, join } from "path";
import { getRepoById, getEnvironment } from "../db.js";
import { loadConfig, COLORS, colorForName } from "../lib/config.js";
import { detectPlatform, getTerminalSpawnArgs, getWindowFocusCommand, getClipboardCommand } from "../lib/platform.js";
import { getMultiplexer } from "../lib/multiplexer/index.js";

const router = Router();
const terminalPids = {};

function pidKey(launcherId, color) { return `${launcherId}:${color}`; }

function isAlive(key) {
  const pid = terminalPids[key];
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { delete terminalPids[key]; return false; }
}

export function tmuxSession(launcherId, color) { return `wb-${launcherId}-${color}`; }

function resolveAppName(appPath) {
  if (!appPath) return null;
  const lower = appPath.toLowerCase();
  if (lower.includes("ghostty")) return "Ghostty";
  if (lower.includes("kitty")) return "kitty";
  if (lower.includes("alacritty")) return "Alacritty";
  if (lower.includes("iterm")) return "iTerm";
  if (lower.includes("terminal.app")) return "Terminal";
  return null;
}

function resolveEnvPath(color) {
  const env = getEnvironment(color);
  if (!env) throw new Error(`No environment assigned to ${color}`);
  if (env.path) return env.path;
  const repo = getRepoById(env.repoId);
  if (!repo) throw new Error(`Repo not found: ${env.repoId}`);
  return join(repo.workDir, `${basename(repo.repoDir)}-${color}`);
}

function resolveTitle(color) {
  const env = getEnvironment(color);
  return env?.issue ? `${color}: ${env.issue.title}` : `workbench-${color}`;
}

function interpolate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

// ── Kill all sessions ───────────────────────────────────────────────────────

router.post("/kill-sessions", async (_req, res) => {
  try {
    const mux = await getMultiplexer();
    const sessions = await mux.listSessions("wb-");
    if (sessions.length === 0) return res.json({ ok: true, killed: 0 });
    for (const s of sessions) {
      await mux.killSession(s);
    }
    res.json({ ok: true, killed: sessions.length });
  } catch {
    res.json({ ok: true, killed: 0 });
  }
});

// ── Launch ──────────────────────────────────────────────────────────────────

router.post("/launch", async (req, res) => {
  const { launcherId, color } = req.body;
  const config = loadConfig();
  const launcher = (config.launchers ?? []).find((l) => l.id === launcherId);
  if (!launcher) return res.status(400).json({ error: `Unknown launcher: ${launcherId}` });

  let envPath;
  try { envPath = resolveEnvPath(color); } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const colorDef = colorForName(color);
  const title = resolveTitle(color);
  const env = getEnvironment(color);
  const vars = { path: envPath, color, title, branch: env?.branch ?? "" };

  if (launcher.type === "command") {
    exec(interpolate(launcher.cmd, vars), (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    });
  } else if (launcher.type === "tmux-terminal" || launcher.type === "mux-terminal") {
    try {
      await launchMuxTerminal(launcher, color, envPath, colorDef, title, res);
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ error: e.message });
    }
  } else {
    res.status(400).json({ error: `Unknown launcher type: ${launcher.type}` });
  }
});

async function launchMuxTerminal(launcher, color, envPath, colorDef, title, res) {
  const mux = await getMultiplexer();
  const muxType = mux.getType();

  if (muxType === "none") {
    return res.json({ ok: true, skipped: true, reason: "no multiplexer available" });
  }

  const key = pidKey(launcher.id, color);
  const session = tmuxSession(launcher.id, color);

  if (isAlive(key)) {
    const pid = terminalPids[key];
    const focusCmd = getWindowFocusCommand(pid);
    if (focusCmd) exec(focusCmd);
    return res.json({ ok: true, reused: true });
  }

  const exists = await mux.hasSession(session);

  if (exists) {
    // Session exists — try to focus the existing terminal window, don't spawn a new one
    if (muxType !== "cmux") {
      // Check if any tmux client is already attached to this session
      const attached = await new Promise((resolve) => {
        exec(`tmux list-clients -t ${session} -F "#{client_pid}" 2>/dev/null`, (err, stdout) => {
          resolve(!err && stdout.trim().length > 0);
        });
      });
      if (attached) {
        // Find the terminal window PID via: tmux client → login → terminal app
        const termPid = await new Promise((resolve) => {
          exec(`tmux list-clients -t ${session} -F "#{client_pid}" 2>/dev/null`, (err, stdout) => {
            if (err || !stdout.trim()) return resolve(null);
            const clientPid = stdout.trim().split("\n")[0];
            // Walk up: tmux client → login → terminal app (grandparent)
            exec(`/bin/ps -o ppid= -p ${clientPid}`, (e1, loginPid) => {
              if (e1 || !loginPid.trim()) return resolve(null);
              exec(`/bin/ps -o ppid= -p ${loginPid.trim()}`, (e2, appPid) => {
                resolve(e2 ? null : appPid.trim() || null);
              });
            });
          });
        });

        if (termPid && process.platform === "darwin") {
          exec(`osascript -e 'tell application "System Events" to set frontmost of (first process whose unix id is ${termPid}) to true'`);
          return res.json({ ok: true, focused: true });
        }
        // Fallback: activate the app generically
        const appName = resolveAppName(launcher.app);
        if (appName && process.platform === "darwin") {
          exec(`open -a "${appName}"`);
          return res.json({ ok: true, focused: true });
        }
        spawnTerminalApp(launcher, session, color, colorDef, title, mux);
        return res.json({ ok: true, reattached: true });
      }
      // No client attached — reattach with a new terminal window
      spawnTerminalApp(launcher, session, color, colorDef, title, mux);
    }
    return res.json({ ok: true, reattached: true });
  }

  // Create the session
  const panes = launcher.panes ?? [{ cmd: null }];
  const config = loadConfig();
  const clipCmd = getClipboardCommand();

  await mux.createSession(session, envPath, panes, {
    colorDef,
    title,
    clipboardCmd: clipCmd,
    port: config?.port ?? 3232,
    color,
  });

  // Spawn terminal app (unless cmux, which IS the terminal)
  if (muxType !== "cmux") {
    spawnTerminalApp(launcher, session, color, colorDef, title, mux);
  }

  res.json({ ok: true });
}

function spawnTerminalApp(launcher, session, color, colorDef, title, mux) {
  const key = pidKey(launcher.id, color);
  const platform = detectPlatform();
  const attachCommand = mux.getAttachCommand(session);

  if (!attachCommand) {
    // No attach command — session exists, but no way to attach from a terminal
    return;
  }

  // Determine terminal name from the app path or launcher id
  let terminalName = launcher.id;
  const appPath = (launcher.app ?? "").toLowerCase();
  if (appPath.includes("ghostty")) terminalName = "ghostty";
  else if (appPath.includes("kitty")) terminalName = "kitty";
  else if (appPath.includes("alacritty")) terminalName = "alacritty";
  else if (appPath.includes("iterm")) terminalName = "iterm2";
  else if (appPath.includes("terminal.app")) terminalName = "terminal.app";
  else if (appPath.includes("gnome-terminal")) terminalName = "gnome-terminal";
  else if (appPath.includes("xterm")) terminalName = "xterm";

  const spawnArgs = getTerminalSpawnArgs(
    terminalName, launcher.app, session, title, colorDef.bg,
    launcher.fullscreen, platform.shell, attachCommand,
  );

  if (!spawnArgs) {
    // Fallback: session exists, user can attach manually
    return;
  }

  // Write config file if needed (e.g., Ghostty)
  if (spawnArgs.configFile && spawnArgs.configContent) {
    writeFileSync(spawnArgs.configFile, spawnArgs.configContent);
  }

  const child = spawn(spawnArgs.bin, spawnArgs.args, { stdio: "ignore", detached: true });
  child.unref();
  terminalPids[key] = child.pid;
  child.on("exit", () => { delete terminalPids[key]; });

  // Run post-spawn script if needed (e.g., iTerm2, Terminal.app)
  if (spawnArgs.postSpawnScript) {
    setTimeout(() => exec(spawnArgs.postSpawnScript), 500);
  }
}

export default router;
