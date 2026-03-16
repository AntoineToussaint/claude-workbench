import { useState, useEffect } from "react";
import api from "../lib/api";

export function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const [detecting, setDetecting] = useState(true);
  const [platform, setPlatform] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [multiplexer, setMultiplexer] = useState(null);

  const [missingDeps, setMissingDeps] = useState([]);

  // Config state
  const [port, setPort] = useState(3232);
  const [selectedTerminal, setSelectedTerminal] = useState(null);
  const [terminalFullscreen, setTerminalFullscreen] = useState(false);
  const [selectedEditor, setSelectedEditor] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api("/setup/detect").then((data) => {
      setPlatform(data.platform);
      setDefaults(data.defaults);
      setMissingDeps(data.missingDeps || []);
      setMultiplexer(data.multiplexer || null);
      setPort(data.defaults.port);
      setSelectedTerminal(data.platform.terminal);
      setTerminalFullscreen(data.platform.terminal.name === "ghostty");
      setSelectedEditor(data.platform.editor);
      setDetecting(false);
    });
  }, []);

  async function handleFinish() {
    setSaving(true);
    const launchers = [];
    if (selectedTerminal?.name && selectedTerminal.name !== "fallback") {
      const termLabels = { ghostty: "Ghostty", kitty: "Kitty", alacritty: "Alacritty", "gnome-terminal": "Terminal", xterm: "XTerm", iterm2: "iTerm", "terminal.app": "Terminal" };
      launchers.push({
        id: selectedTerminal.name === "terminal.app" ? "terminal" : selectedTerminal.name,
        label: termLabels[selectedTerminal.name] ?? selectedTerminal.name,
        icon: "terminal",
        type: "tmux-terminal",
        app: selectedTerminal.bin,
        fullscreen: terminalFullscreen,
        panes: [{ cmd: "claude --continue", focus: true }, { cmd: null }],
      });
    }
    if (selectedEditor) {
      const editorLabels = { zed: "Zed", cursor: "Cursor", code: "VS Code" };
      launchers.push({
        id: selectedEditor,
        label: editorLabels[selectedEditor] ?? selectedEditor,
        icon: "editor",
        type: "command",
        cmd: `${selectedEditor} "{{path}}"`,
      });
    }
    await api("/setup", {
      method: "POST",
      body: JSON.stringify({ port, launchers }),
    });
    setSaving(false);
    onComplete();
  }


  if (detecting) {
    return (
      <div className="setup-wizard">
        <div className="setup-card">
          <h1>Claude Workbench</h1>
          <p className="setup-subtitle">Detecting your system...</p>
        </div>
      </div>
    );
  }

  const steps = [
    // Step 0: Welcome + dependencies
    <div key="welcome" className="setup-step">
      <h2>Welcome</h2>
      <p className="setup-text">Let's configure your workbench. We detected:</p>
      <div className="setup-detections">
        <div className="setup-detection">
          <span className="setup-detection-label">OS</span>
          <span className="setup-detection-value">{platform.os === "darwin" ? "macOS" : "Linux"}</span>
        </div>
        <div className="setup-detection">
          <span className="setup-detection-label">Terminal</span>
          <span className="setup-detection-value">{selectedTerminal?.name ?? "none"}</span>
        </div>
        <div className="setup-detection">
          <span className="setup-detection-label">Editor</span>
          <span className="setup-detection-value">{selectedEditor ?? "none"}</span>
        </div>
        <div className="setup-detection">
          <span className="setup-detection-label">Shell</span>
          <span className="setup-detection-value">{platform.shell.split("/").pop()}</span>
        </div>
        <div className="setup-detection">
          <span className="setup-detection-label">Multiplexer</span>
          <span className="setup-detection-value">{multiplexer ?? "none"}</span>
        </div>
      </div>
      {missingDeps.length > 0 && (
        <div className="setup-warnings">
          {missingDeps.map((d) => (
            <div key={d} className="setup-warning">Missing: {d}</div>
          ))}
          <p className="setup-hint">
            Install with: {platform.os === "darwin"
              ? `brew install ${missingDeps.map(d => d.split(" ")[0]).join(" ")}`
              : `apt install ${missingDeps.map(d => d.split(" ")[0]).join(" ")}`}
          </p>
        </div>
      )}
    </div>,

    // Step 1: Terminal + Editor
    <div key="launchers" className="setup-step">
      <h2>Launchers</h2>
      <p className="setup-text">How to open terminals and editors for each workspace.</p>

      <div className="form-row" style={{ marginBottom: 16 }}>
        <label>Terminal</label>
        <div className="setup-terminal-info">
          <span className="setup-detection-value">{selectedTerminal?.name ?? "none detected"}</span>
          {selectedTerminal?.name === "ghostty" && (
            <label className="setup-checkbox">
              <input type="checkbox" checked={terminalFullscreen} onChange={(e) => setTerminalFullscreen(e.target.checked)} />
              Fullscreen
            </label>
          )}
        </div>
      </div>

      <div className="form-row" style={{ marginBottom: 16 }}>
        <label>Editor</label>
        <div className="setup-editor-options">
          {["zed", "cursor", "code"].map((e) => (
            <button
              key={e}
              className={`setup-editor-btn ${selectedEditor === e ? "active" : ""}`}
              onClick={() => setSelectedEditor(selectedEditor === e ? null : e)}
            >
              {{ zed: "Zed", cursor: "Cursor", code: "VS Code" }[e]}
            </button>
          ))}
          <button
            className={`setup-editor-btn ${selectedEditor === null ? "active" : ""}`}
            onClick={() => setSelectedEditor(null)}
          >
            None
          </button>
        </div>
      </div>

      <div className="form-row">
        <label>Port</label>
        <input
          type="number"
          value={port}
          onChange={(e) => setPort(parseInt(e.target.value) || 3232)}
          style={{ width: 100 }}
        />
      </div>
    </div>,

    // Step 3: Confirm
    <div key="confirm" className="setup-step">
      <h2>Ready</h2>
      <div className="setup-summary">
        <div className="setup-summary-row">
          <span>Terminal</span>
          <span>{selectedTerminal?.name ?? "none"}{terminalFullscreen ? " (fullscreen)" : ""}</span>
        </div>
        <div className="setup-summary-row">
          <span>Editor</span>
          <span>{selectedEditor ?? "none"}</span>
        </div>
        <div className="setup-summary-row">
          <span>Port</span>
          <span>{port}</span>
        </div>
        <div className="setup-summary-row">
          <span>Multiplexer</span>
          <span>{multiplexer ?? "none"}</span>
        </div>
      </div>
      <p className="setup-hint">You can change these later in settings.</p>
    </div>,
  ];

  const isLast = step === steps.length - 1;

  return (
    <div className="setup-wizard">
      <div className="setup-card">
        <h1>Claude Workbench</h1>
        <div className="setup-progress">
          {steps.map((_, i) => (
            <div key={i} className={`setup-progress-dot ${i <= step ? "active" : ""}`} />
          ))}
        </div>
        {steps[step]}
        <div className="setup-actions">
          {step > 0 && (
            <button className="modal-cancel-btn" onClick={() => setStep(step - 1)}>Back</button>
          )}
          {!isLast ? (
            <button
              className="modal-submit-btn"
              onClick={() => setStep(step + 1)}
              disabled={false}
            >
              Next
            </button>
          ) : (
            <button className="modal-submit-btn" onClick={handleFinish} disabled={saving}>
              {saving ? "Setting up..." : "Start"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
