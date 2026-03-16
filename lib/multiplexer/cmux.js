import net from "net";
import { join } from "path";
import { homedir } from "os";

const socketPath = join(homedir(), ".cmux", "socket");

function sendCommand(cmd) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(socketPath);
    sock.write(JSON.stringify(cmd) + "\n");
    let data = "";
    sock.on("data", (d) => (data += d));
    sock.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(null);
      }
    });
    sock.on("error", reject);
    setTimeout(() => {
      sock.destroy();
      reject(new Error("timeout"));
    }, 5000);
  });
}

export class CmuxMultiplexer {
  async createSession(name, cwd, panes, config = {}) {
    const { color = "", title = "" } = config;
    try {
      await sendCommand({
        action: "new-workspace",
        name,
        cwd,
        title: title || `${color} workspace`,
      });

      // Create additional panes via splits
      for (let i = 1; i < panes.length; i++) {
        await sendCommand({
          action: "new-split",
          workspace: name,
          direction: "horizontal",
          cwd,
          cmd: panes[i]?.cmd || null,
        });
      }

      // Run first pane command if specified
      if (panes[0]?.cmd) {
        await sendCommand({
          action: "run-command",
          workspace: name,
          pane: 0,
          cmd: panes[0].cmd,
        });
      }
    } catch {
      // Socket not available — silently fail
    }
  }

  async hasSession(name) {
    try {
      const result = await sendCommand({ action: "has-workspace", name });
      return result?.exists === true;
    } catch {
      return false;
    }
  }

  async listSessions(prefix) {
    try {
      const result = await sendCommand({ action: "list-workspaces" });
      const sessions = result?.workspaces ?? [];
      return sessions.filter((s) => s.startsWith(prefix));
    } catch {
      return [];
    }
  }

  async killSession(name) {
    try {
      await sendCommand({ action: "kill-workspace", name });
    } catch {
      // ignore
    }
  }

  async capturePane(_session, _paneIndex, _lines) {
    // Pane capture is unreliable in cmux — state detection uses webhooks instead
    return null;
  }

  async splitPane(session, direction, cwd, cmd) {
    try {
      await sendCommand({
        action: "new-split",
        workspace: session,
        direction: direction === "h" ? "horizontal" : "vertical",
        cwd,
        cmd: cmd || null,
      });
    } catch {
      // ignore
    }
  }

  async selectPane(session, index) {
    try {
      await sendCommand({ action: "focus-pane", workspace: session, pane: index });
    } catch {
      // ignore
    }
  }

  async setOption(_session, _key, _value) {
    // cmux options are handled differently — no-op
  }

  async setEnv(_session, _key, _value) {
    // cmux environment is inherited — no-op
  }

  /**
   * Send a notification to the cmux sidebar.
   */
  async notify(message) {
    try {
      await sendCommand({ action: "notify", message });
    } catch {
      // ignore
    }
  }

  /**
   * Open a URL in the cmux embedded browser panel.
   */
  async openBrowser(url) {
    try {
      await sendCommand({ action: "open-browser", url });
    } catch {
      // ignore
    }
  }

  getAttachCommand(_session) {
    // cmux IS the terminal — no attach command needed
    return "";
  }

  getType() {
    return "cmux";
  }

  getCapabilities() {
    return {
      stateDetection: false,
      notifications: true,
      embeddedBrowser: true,
      splitPanes: true,
    };
  }
}
