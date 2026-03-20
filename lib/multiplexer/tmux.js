import { exec as execCb } from "child_process";

function exec(cmd) {
  return new Promise((resolve, reject) => {
    execCb(cmd, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve(stdout ?? "");
    });
  });
}

function execSafe(cmd) {
  return new Promise((resolve) => {
    execCb(cmd, (err, stdout) => {
      resolve({ err, stdout: stdout ?? "" });
    });
  });
}

export class TmuxMultiplexer {
  /**
   * Create a tmux session with panes and styling.
   * @param {string} name - Session name
   * @param {string} cwd - Working directory
   * @param {Array<{cmd: string|null, focus?: boolean}>} panes - Pane definitions
   * @param {Object} config - Session configuration
   * @param {Object} config.colorDef - { hex, bg }
   * @param {string} config.title - Window title
   * @param {string|null} config.clipboardCmd - Clipboard command
   * @param {number} config.port - Server port for objective pane
   * @param {string} config.color - Color name
   */
  async createSession(name, cwd, panes, config = {}) {
    const { colorDef = {}, title = "", clipboardCmd = null, port = 3232, color = "" } = config;
    const cmds = [];

    const firstCmd = panes[0]?.cmd;
    if (firstCmd) {
      // Wrap command to fall back to shell on exit (avoids "Pane is dead")
      const wrapped = `${firstCmd}; exec $SHELL`;
      cmds.push(`tmux new-session -d -s ${name} -c "${cwd}" '${wrapped}'`);
    } else {
      cmds.push(`tmux new-session -d -s ${name} -c "${cwd}"`);
    }

    // Clean environment
    cmds.push(
      `tmux set-environment -g -u CLAUDECODE`,
      `tmux set-environment -g -u ANTHROPIC_API_KEY`,
      `tmux set-environment -t ${name} -u CLAUDECODE`,
      `tmux set-environment -t ${name} -u ANTHROPIC_API_KEY`,
    );

    // Options — mouse ON so users can click to switch panes
    cmds.push(
      `tmux set-option -t ${name} mouse on`,
      `tmux set-option -t ${name} set-clipboard on`,
      `tmux set-option -t ${name} allow-passthrough on`,
    );

    // Status bar — colored background so it's instantly recognizable
    const accent = colorDef.hex ?? "#ffffff";
    const bg = colorDef.bg ?? "#1a1a1a";
    const safeTitle = title.replace(/"/g, '\\"');
    cmds.push(
      `tmux set-option -t ${name} status on`,
      `tmux set-option -t ${name} status-style "bg=${accent},fg=#000000"`,
      `tmux set-option -t ${name} status-left "#[bg=${accent},fg=#000000,bold] ● ${color.toUpperCase()} "`,
      `tmux set-option -t ${name} status-left-length 30`,
      `tmux set-option -t ${name} status-right "#[bg=${accent},fg=#000000] ${safeTitle} "`,
      `tmux set-option -t ${name} status-right-length 60`,
      `tmux set-option -t ${name} window-status-current-format ""`,
      `tmux set-option -t ${name} window-status-format ""`,
    );

    // Additional panes (split horizontally)
    for (let i = 1; i < panes.length; i++) {
      const paneCmd = panes[i]?.cmd;
      if (paneCmd) {
        const wrapped = `${paneCmd}; exec $SHELL`;
        cmds.push(`tmux split-window -h -t ${name} -c "${cwd}" '${wrapped}'`);
      } else {
        cmds.push(`tmux split-window -h -t ${name} -c "${cwd}"`);
      }
    }

    // Objective pane (vertical split at bottom of last pane)
    const lastPane = panes.length - 1;
    let paneOffset = 0;
    const objectiveCmd = `while clear && curl -s http://localhost:${port}/api/environments/${color}/objective 2>/dev/null; do sleep 5; done`;
    cmds.push(`tmux split-window -v -b -t ${name}:.${lastPane} -c "${cwd}" -l 4 '${objectiveCmd}'`);
    paneOffset = 1;

    // Focus the correct pane
    let focusPane = 0;
    panes.forEach((pane, i) => {
      if (pane.focus) focusPane = i <= lastPane - 1 ? i : i + paneOffset;
    });
    cmds.push(`tmux select-pane -t ${name}:.${focusPane}`);

    await exec(cmds.join(" && "));
  }

  async hasSession(name) {
    const { err } = await execSafe(`tmux has-session -t ${name} 2>/dev/null`);
    return !err;
  }

  async listSessions(prefix) {
    const { stdout } = await execSafe(`tmux list-sessions -F "#{session_name}" 2>/dev/null`);
    return (stdout ?? "").split("\n").filter((s) => s.startsWith(prefix));
  }

  async killSession(name) {
    await execSafe(`tmux kill-session -t ${name}`);
  }

  async capturePane(session, paneIndex, lines) {
    const { err, stdout } = await execSafe(
      `tmux capture-pane -t ${session}:.${paneIndex} -p -S -${lines} 2>/dev/null`
    );
    if (err) return null;
    return stdout;
  }

  async splitPane(session, direction, cwd, cmd) {
    const flag = direction === "h" ? "-h" : "-v";
    const cmdPart = cmd ? ` '${cmd}'` : "";
    await exec(`tmux split-window ${flag} -t ${session} -c "${cwd}"${cmdPart}`);
  }

  async selectPane(session, index) {
    await exec(`tmux select-pane -t ${session}:.${index}`);
  }

  async setOption(session, key, value) {
    await exec(`tmux set-option -t ${session} ${key} ${value}`);
  }

  async setEnv(session, key, value) {
    await exec(`tmux set-environment -t ${session} ${key} ${value}`);
  }

  getAttachCommand(session) {
    return `tmux attach -t ${session}`;
  }

  getType() {
    return "tmux";
  }

  getCapabilities() {
    return {
      stateDetection: true,
      notifications: false,
      embeddedBrowser: false,
      splitPanes: true,
    };
  }
}
