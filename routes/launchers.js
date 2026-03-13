import { Router } from "express";
import { exec, spawn } from "child_process";
import { writeFileSync } from "fs";
import { basename } from "path";
import { getRepoById, getEnvironment } from "../db.js";
import { loadConfig, COLORS } from "../lib/config.js";

const router = Router();
const terminalPids = {};

function pidKey(launcherId, color) { return `${launcherId}:${color}`; }

function isAlive(key) {
  const pid = terminalPids[key];
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { delete terminalPids[key]; return false; }
}

export function tmuxSession(launcherId, color) { return `wb-${launcherId}-${color}`; }

function resolveEnvPath(color) {
  const env = getEnvironment(color);
  if (env?.path) return env.path;
  const repo = getRepoById(env?.repoId);
  const repoName = basename(repo?.repoDir ?? "workbench");
  return join(repo?.workDir ?? "/tmp", `${repoName}-${color}`);
}

function resolveTitle(color) {
  const env = getEnvironment(color);
  return env?.issue ? `${color}: ${env.issue.title}` : `workbench-${color}`;
}

function interpolate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

// ── Kill all sessions ───────────────────────────────────────────────────────

router.post("/kill-sessions", (_req, res) => {
  exec(`tmux list-sessions -F "#{session_name}" 2>/dev/null`, (_err, out) => {
    const sessions = (out ?? "").split("\n").filter((s) => s.startsWith("wb-"));
    if (sessions.length === 0) return res.json({ ok: true, killed: 0 });
    exec(sessions.map((s) => `tmux kill-session -t ${s}`).join(" ; "), () => {
      res.json({ ok: true, killed: sessions.length });
    });
  });
});

// ── Launch ──────────────────────────────────────────────────────────────────

router.post("/launch", (req, res) => {
  const { launcherId, color } = req.body;
  const config = loadConfig();
  const launcher = (config.launchers ?? []).find((l) => l.id === launcherId);
  if (!launcher) return res.status(400).json({ error: `Unknown launcher: ${launcherId}` });

  const envPath = resolveEnvPath(color);
  const colorDef = COLORS[color] ?? { hex: "#888", bg: "#111" };
  const title = resolveTitle(color);
  const env = getEnvironment(color);
  const vars = { path: envPath, color, title, branch: env?.branch ?? "" };

  if (launcher.type === "command") {
    exec(interpolate(launcher.cmd, vars), (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    });
  } else if (launcher.type === "tmux-terminal") {
    launchTmuxTerminal(launcher, color, envPath, colorDef, title, res);
  } else {
    res.status(400).json({ error: `Unknown launcher type: ${launcher.type}` });
  }
});

function launchTmuxTerminal(launcher, color, envPath, colorDef, title, res) {
  const key = pidKey(launcher.id, color);
  const session = tmuxSession(launcher.id, color);

  if (isAlive(key)) {
    const pid = terminalPids[key];
    exec(`osascript -e 'tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true'`);
    return res.json({ ok: true, reused: true });
  }

  exec(`tmux has-session -t ${session} 2>/dev/null`, (err) => {
    if (!err) {
      spawnTerminalApp(launcher, session, color, colorDef, title);
      return res.json({ ok: true, reattached: true });
    }

    const panes = launcher.panes ?? [{ cmd: null }];
    let focusPane = 0;
    const cmds = [];

    const firstCmd = panes[0]?.cmd;
    if (firstCmd) {
      cmds.push(`tmux new-session -d -s ${session} -c "${envPath}" '${firstCmd}'`);
      cmds.push(`tmux set-option -t ${session} remain-on-exit on`);
    } else {
      cmds.push(`tmux new-session -d -s ${session} -c "${envPath}"`);
    }

    cmds.push(
      `tmux set-environment -g -u CLAUDECODE`,
      `tmux set-environment -g -u ANTHROPIC_API_KEY`,
      `tmux set-environment -t ${session} -u CLAUDECODE`,
      `tmux set-environment -t ${session} -u ANTHROPIC_API_KEY`,
      `tmux set-option -t ${session} mouse on`,
      `tmux set-option -t ${session} set-clipboard on`,
      `tmux set-option -t ${session} allow-passthrough on`,
      `tmux set-option -t ${session} copy-command 'pbcopy'`,
      `tmux bind-key -T copy-mode MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel 'pbcopy'`,
      `tmux bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel 'pbcopy'`,
      `tmux set-option -t ${session} status-style "bg=${colorDef.hex},fg=#000000"`,
      `tmux set-option -t ${session} status-left " ■ ${color.toUpperCase()} │ ${title} "`,
      `tmux set-option -t ${session} status-left-length 120`,
      `tmux set-option -t ${session} status-right ""`,
      `tmux set-option -t ${session} window-status-format ""`,
      `tmux set-option -t ${session} window-status-current-format ""`,
    );

    for (let i = 1; i < panes.length; i++) {
      const paneCmd = panes[i]?.cmd;
      if (paneCmd) {
        cmds.push(`tmux split-window -h -t ${session} -c "${envPath}" '${paneCmd}'`);
      } else {
        cmds.push(`tmux split-window -h -t ${session} -c "${envPath}"`);
      }
    }

    const lastPane = panes.length - 1;
    let paneOffset = 0;
    const config = loadConfig();
    const port = config.port ?? 3131;
    const objectiveCmd = `while clear && curl -s http://localhost:${port}/api/environments/${color}/objective 2>/dev/null; do sleep 5; done`;
    cmds.push(`tmux split-window -v -b -t ${session}:.${lastPane} -c "${envPath}" -l 20% '${objectiveCmd}'`);
    paneOffset = 1;

    panes.forEach((pane, i) => {
      if (pane.focus) focusPane = i <= lastPane - 1 ? i : i + paneOffset;
    });

    cmds.push(`tmux select-pane -t ${session}:.${focusPane}`);

    exec(cmds.join(" && "), (err) => {
      if (err) return res.status(500).json({ error: err.message });
      spawnTerminalApp(launcher, session, color, colorDef, title);
      res.json({ ok: true });
    });
  });
}

function spawnTerminalApp(launcher, session, color, colorDef, title) {
  const key = pidKey(launcher.id, color);
  const appPath = launcher.app;

  if (appPath.includes("ghostty") || appPath.includes("Ghostty")) {
    const configPath = `/tmp/wb-${launcher.id}-${color}.conf`;
    const lines = [
      `command = /bin/zsh -c "exec tmux attach -t ${session}"`,
      `background = ${colorDef.bg}`,
      `title = ${title}`,
      `window-save-state = never`,
      `confirm-close-surface = false`,
      `keybind = super+n=new_window`,
    ];
    if (launcher.fullscreen) {
      lines.push(`fullscreen = true`, `macos-non-native-fullscreen = true`);
    }
    writeFileSync(configPath, lines.join("\n") + "\n");

    const child = spawn(appPath, [`--config-file=${configPath}`], { stdio: "ignore", detached: true });
    child.unref();
    terminalPids[key] = child.pid;
    child.on("exit", () => { delete terminalPids[key]; });
  } else {
    const child = spawn(appPath, ["-e", `tmux attach -t ${session}`], { stdio: "ignore", detached: true });
    child.unref();
    terminalPids[key] = child.pid;
    child.on("exit", () => { delete terminalPids[key]; });
  }
}

export default router;
