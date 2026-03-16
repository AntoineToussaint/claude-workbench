import { useState, useEffect, useRef, Component } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ── API helper ──────────────────────────────────────────────────────────────

async function api(path, opts) {
  try {
    const r = await fetch(`/api${path}`, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    const text = await r.text();
    const data = text ? JSON.parse(text) : {};
    if (!r.ok) {
      if (typeof data === "object" && data !== null) data.ok = false;
      return data.error ? data : { ok: false, error: `HTTP ${r.status}`, ...data };
    }
    return data;
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Error boundary ──────────────────────────────────────────────────────────

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>
          <h2 style={{ marginBottom: 12 }}>Something went wrong</h2>
          <pre style={{ fontSize: 12, color: "#888", whiteSpace: "pre-wrap" }}>{this.state.error.message}</pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{ marginTop: 16, padding: "8px 20px", background: "#2a2a2a", border: "none", borderRadius: 5, color: "#ccc", cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Setup wizard ────────────────────────────────────────────────────────────

function SetupWizard({ onComplete }) {
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

// ── Icons ───────────────────────────────────────────────────────────────────

const ICONS = {
  terminal: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 4h16v12H4V4zm2 2v8h12V6H6zm-2 10h16v2H4v-2z"/>
    </svg>
  ),
  editor: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 5h18v2.5L7.5 17H21v2H3v-2.5L16.5 7H3V5z"/>
    </svg>
  ),
  browser: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
    </svg>
  ),
  default: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
    </svg>
  ),
  grip: (
    <svg width="10" height="14" viewBox="0 0 24 24" fill="#555">
      <path d="M8 6h2v2H8V6zm6 0h2v2h-2V6zM8 11h2v2H8v-2zm6 0h2v2h-2v-2zm-6 5h2v2H8v-2zm6 0h2v2h-2v-2z"/>
    </svg>
  ),
};

// ── Task picker modal ───────────────────────────────────────────────────────

function TaskPickerModal({ issues, loading, onPick, onClose }) {
  const [search, setSearch] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customBody, setCustomBody] = useState("");

  const filtered = issues.filter(
    (i) =>
      i.title.toLowerCase().includes(search.toLowerCase()) ||
      String(i.number).includes(search)
  );

  function handleCustomSubmit(e) {
    e.preventDefault();
    if (!customTitle.trim()) return;
    onPick({
      number: Date.now(),
      title: customTitle.trim(),
      body: customBody.trim(),
      url: null,
      labels: [],
      custom: true,
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{customMode ? "Custom Task" : "Pick a Task"}</h3>

        {customMode ? (
          <form onSubmit={handleCustomSubmit} style={{ padding: "0 20px 16px" }}>
            <input
              className="modal-search"
              placeholder="Task title..."
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              autoFocus
              style={{ margin: "0 0 8px", width: "100%" }}
            />
            <textarea
              className="modal-search"
              placeholder="Description (optional)..."
              value={customBody}
              onChange={(e) => setCustomBody(e.target.value)}
              rows={3}
              style={{ margin: "0 0 12px", width: "100%", resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="modal-cancel-btn" onClick={() => setCustomMode(false)}>Back</button>
              <button type="submit" className="modal-submit-btn" disabled={!customTitle.trim()}>Create</button>
            </div>
          </form>
        ) : (
          <>
            <input
              className="modal-search"
              placeholder="Search issues..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div className="issue-list">
              <button className="issue-row custom-task-row" onClick={() => setCustomMode(true)}>
                <span style={{ color: "#888", fontSize: 16 }}>+</span>
                <span className="issue-title-text" style={{ color: "#888" }}>Custom task (no GitHub issue)</span>
              </button>
              {loading && <p className="muted">Loading issues...</p>}
              {!loading && filtered.length === 0 && <p className="muted">No issues found</p>}
              {filtered.map((issue) => (
                <button
                  key={issue.number}
                  className="issue-row"
                  onClick={() => onPick(issue)}
                >
                  <span className="issue-number">#{issue.number}</span>
                  <span className="issue-title-text">{issue.title}</span>
                  {issue.labels?.map((l) => (
                    <span key={l.name} className="issue-label" style={{ background: `#${l.color}` }}>
                      {l.name}
                    </span>
                  ))}
                </button>
              ))}
            </div>
          </>
        )}

        {!customMode && (
          <div className="modal-footer">
            <button onClick={onClose}>Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Settings panel ──────────────────────────────────────────────────────────

function SettingsPanel({ repos, onClose, onReposChanged }) {
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [manualPath, setManualPath] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [confirmKill, setConfirmKill] = useState(false);

  async function handleBrowse() {
    setError(null);
    setAdding(true);
    const result = await api("/add-repo", { method: "POST" });
    setAdding(false);
    if (result.error === "no_folder_picker") {
      setManualPath(true);
      return;
    }
    if (result.error) {
      if (result.error !== "Cancelled") setError(result.error);
    } else {
      onReposChanged();
    }
  }

  async function handleManualAdd(e) {
    e.preventDefault();
    if (!pathInput.trim()) return;
    setError(null);
    setAdding(true);
    const result = await api("/add-repo", {
      method: "POST",
      body: JSON.stringify({ dir: pathInput.trim() }),
    });
    setAdding(false);
    if (result.error) {
      setError(result.error);
    } else {
      setManualPath(false);
      setPathInput("");
      onReposChanged();
    }
  }

  async function handleDelete(id) {
    if (!confirm(`Remove project "${id}"?`)) return;
    await api(`/repos/${encodeURIComponent(id)}`, { method: "DELETE" });
    onReposChanged();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Projects</h3>
        <div className="repo-list">
          {repos.map((r) => (
            <div key={r.id} className="repo-row">
              <div className="repo-info">
                <span className="repo-name">{r.id}</span>
                <span className="repo-path">{r.repoDir}</span>
                {r.repo && <span className="repo-meta">{r.repo.split("/").slice(-2).join("/")}</span>}
              </div>
              <button className="repo-delete-btn" onClick={() => handleDelete(r.id)}>×</button>
            </div>
          ))}
          {repos.length === 0 && <p className="muted">No projects yet</p>}
        </div>

        <button className="add-repo-btn" onClick={handleBrowse} disabled={adding}>
          {adding ? "Select a folder..." : "+ Add Project"}
        </button>

        {manualPath && (
          <form onSubmit={handleManualAdd} style={{ padding: "0 18px 8px", display: "flex", gap: 8 }}>
            <input
              className="modal-search"
              placeholder="/path/to/git/repo"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              autoFocus
              style={{ margin: 0, flex: 1 }}
            />
            <button type="submit" className="modal-submit-btn" disabled={!pathInput.trim() || adding}>Add</button>
            <button type="button" className="modal-cancel-btn" onClick={() => setManualPath(false)}>Cancel</button>
          </form>
        )}

        <button
          className="add-repo-btn"
          onClick={async () => {
            setError(null);
            setAdding(true);
            const result = await api("/scan-folder", { method: "POST" });
            setAdding(false);
            if (result.error) {
              if (result.error !== "Cancelled") setError(result.error);
            } else {
              onReposChanged();
            }
          }}
          disabled={adding}
        >
          Scan Folder
        </button>

        {error && <p className="form-error" style={{ padding: "0 18px 8px" }}>{error}</p>}

        {!confirmKill ? (
          <button
            className="kill-sessions-btn"
            onClick={() => setConfirmKill(true)}
          >
            Kill All Sessions
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8, padding: "0 18px 10px" }}>
            <button
              className="confirm-release-btn"
              style={{ flex: 1, fontSize: 11 }}
              onClick={async () => {
                await api("/kill-sessions", { method: "POST" });
                setConfirmKill(false);
              }}
            >
              Confirm Kill All
            </button>
            <button className="modal-cancel-btn" onClick={() => setConfirmKill(false)}>Cancel</button>
          </div>
        )}

        <div className="modal-footer">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Repo picker ─────────────────────────────────────────────────────────────

function RepoPickerModal({ repos, onPick, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Pick a Repo</h3>
        <div className="issue-list">
          {repos.map((repo) => (
            <button
              key={repo.id}
              className="issue-row"
              onClick={() => onPick(repo.id)}
            >
              <span className="issue-title-text">{repo.id}</span>
              <span style={{ color: "#666", fontSize: 11, marginLeft: "auto" }}>{repo.mode}</span>
            </button>
          ))}
        </div>
        <div className="modal-footer">
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Status bar ──────────────────────────────────────────────────────────────

function StatusBar({ status }) {
  if (!status?.active) return null;
  const needsAttention = status.claudeState === "approval" || status.claudeState === "waiting";
  const claudeLabels = { working: "working", approval: "waiting for you", waiting: "idle", shell: "shell" };
  const claudeLabel = claudeLabels[status.claudeState] ?? null;
  return (
    <div className="status-bar">
      <span className={`status-dot ${status.tmuxAlive ? "alive" : "dead"}`} title={status.tmuxAlive ? "Session active" : "No session"} />
      {needsAttention && (
        <span className="status-tag attention">needs your attention</span>
      )}
      {claudeLabel && !needsAttention && (
        <span className={`status-tag claude-${status.claudeState}`}>{claudeLabel}</span>
      )}
      {status.changedFiles > 0 && (
        <span className="status-tag dirty">{status.changedFiles} changed</span>
      )}
      {status.ahead > 0 && (
        <span className="status-tag ahead">{status.ahead} ahead</span>
      )}
      {status.behind > 0 && (
        <span className="status-tag behind">{status.behind} behind</span>
      )}
      {status.pr && (
        <a
          className="status-tag pr-link"
          href={status.pr.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          PR #{status.pr.number}
        </a>
      )}
      {status.checks && status.checks.total > 0 && (
        <span className={`status-tag ci-status ci-has-tooltip ${status.checks.fail > 0 ? "ci-fail" : status.checks.pending > 0 ? "ci-pending" : "ci-pass"}`}>
          {status.checks.fail > 0
            ? `CI ${status.checks.fail} failed`
            : status.checks.pending > 0
            ? `CI ${status.checks.pending} pending`
            : `CI ${status.checks.pass} passed`}
          {status.checks.items && status.checks.items.length > 0 && (
            <span className="ci-tooltip" onClick={(e) => e.stopPropagation()}>
              {status.checks.items.map((c, i) => (
                <span key={i} className="ci-tooltip-row">
                  <span className={`ci-tooltip-icon ${c.status === "SUCCESS" ? "ci-ok" : c.status === "FAILURE" || c.status === "TIMED_OUT" || c.status === "CANCELLED" ? "ci-err" : "ci-wait"}`}>
                    {c.status === "SUCCESS" ? "\u2713" : c.status === "FAILURE" || c.status === "TIMED_OUT" || c.status === "CANCELLED" ? "\u2717" : "\u25CB"}
                  </span>
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noreferrer" className="ci-tooltip-link">{c.name}</a>
                  ) : (
                    <span className="ci-tooltip-name">{c.name}</span>
                  )}
                </span>
              ))}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

// ── Edit task modal ─────────────────────────────────────────────────────────

function EditTaskModal({ env, onClose, onSave }) {
  const [title, setTitle] = useState(env.issue.title);
  const [body, setBody] = useState(env.issue.body ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    await onSave({ title: title.trim(), body: body.trim() });
    setSaving(false);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal edit-issue-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Edit Task</h3>
        <form onSubmit={handleSave} className="edit-issue-form">
          <div className="form-row">
            <label>Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              placeholder="Task title..."
            />
          </div>
          <div className="form-row">
            <label>Description</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              placeholder="Describe the task..."
            />
          </div>
          <div className="edit-issue-actions">
            <button type="button" className="modal-cancel-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-submit-btn" disabled={!title.trim() || saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Create PR modal ─────────────────────────────────────────────────────────

function CreatePrModal({ proposal, onClose, onSubmit }) {
  const [branch, setBranch] = useState(proposal.branch);
  const [title, setTitle] = useState(proposal.title);
  const [body, setBody] = useState(proposal.body);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = title.trim() && (proposal.needsBranch ? branch.trim() : true);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit({ branch, title, body });
    setSubmitting(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal edit-issue-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Create Pull Request</h3>
        <form onSubmit={handleSubmit} className="edit-issue-form">
          {proposal.needsBranch && (
            <div className="form-row">
              <label>Branch</label>
              <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="branch-name" />
            </div>
          )}
          <div className="form-row">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="PR title..." />
          </div>
          <div className="form-row">
            <label>Body</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} placeholder="Describe the changes..." />
          </div>
          <div className="edit-issue-actions">
            <button type="button" className="modal-cancel-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-submit-btn" disabled={!canSubmit || submitting}>
              {submitting ? "Creating..." : "Create PR"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── DnD wrappers ────────────────────────────────────────────────────────────

function SortableCard({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="sortable-card-wrapper">
      <div className="card-drag-handle" {...attributes} {...listeners}>
        {ICONS.grip}
      </div>
      {children}
    </div>
  );
}

function SortableSection({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };
  return (
    <section ref={setNodeRef} style={style} className="project-section">
      <div className="section-drag-handle" {...attributes} {...listeners}>
        {ICONS.grip}
      </div>
      {children}
    </section>
  );
}

// ── Release confirmation modal ──────────────────────────────────────────────

function ReleaseModal({ color, status, onClose, onConfirm }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Release {color}?</h3>
        <p className="confirm-text">This will remove the worktree and free the slot.</p>
        {status?.active && (
          <div className="release-status-info">
            {status.changedFiles > 0 && (
              <div className="release-warning">{status.changedFiles} uncommitted file{status.changedFiles > 1 ? "s" : ""}</div>
            )}
            {status.ahead > 0 && (
              <div className="release-warning">{status.ahead} unpushed commit{status.ahead > 1 ? "s" : ""}</div>
            )}
            {status.pr && (
              <div className="release-info">PR #{status.pr.number} is open</div>
            )}
            {!status.changedFiles && !status.ahead && !status.pr && (
              <div className="release-info">Clean — no uncommitted or unpushed work</div>
            )}
          </div>
        )}
        <div className="confirm-actions">
          <button className="modal-cancel-btn" onClick={onClose}>Cancel</button>
          <button className="confirm-release-btn" onClick={onConfirm}>Release</button>
        </div>
      </div>
    </div>
  );
}

// ── Environment card ────────────────────────────────────────────────────────

function EnvCard({ color, env, launchers, status, multiRepo, onAssign, onRelease, onLaunch, onCreatePr, onUpdateTask }) {
  const merged = status?.merged;
  const [editing, setEditing] = useState(false);
  const labels = env?.issue?.labels ?? [];
  const body = env?.issue?.body;

  return (
    <div className={`env-card${merged ? " env-card-merged" : ""}`} style={{ borderTop: `3px solid ${merged ? "#22c55e" : color.hex}` }}>
      <div className="env-header">
        <span className="env-dot" style={{ background: merged ? "#22c55e" : color.hex }} />
        <span className="env-name">{color.name}</span>
        {env && !merged && (
          <button
            className="release-btn"
            onClick={() => onRelease(color.name)}
            title="Release slot"
          >
            ×
          </button>
        )}
      </div>

      {env ? (
        <div className="env-body">
          <div className="env-issue-section" onClick={() => !merged && setEditing(true)} title="Click to edit">
            <div className="env-issue">
              {!env.issue.custom && <span className="env-issue-number">#{env.issue.number}</span>}
              {env.issue.custom && <span className="env-local-badge">local</span>}
              <span className="env-issue-title">{env.issue.title}</span>
              {!merged && (
                <button className="edit-issue-btn" onClick={(e) => { e.stopPropagation(); setEditing(true); }} title="Edit task">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                </button>
              )}
            </div>
            {labels.length > 0 && (
              <div className="env-labels">
                {labels.map((l) => (
                  <span key={l.name} className="env-label" style={{ background: `#${l.color}` }}>{l.name}</span>
                ))}
              </div>
            )}
            {body && (
              <div className="env-description">{body.length > 120 ? body.slice(0, 120) + "…" : body}</div>
            )}
          </div>

          {multiRepo && env.repoId && (
            <div className="env-repo-tag">{env.repoId}</div>
          )}
          <div className="env-branch">{env.branch}</div>

          {merged && (
            <div className="env-merged">
              <span className="merged-badge">Merged</span>
              {status.pr && (
                <a className="status-tag pr-link" href={status.pr.url} target="_blank" rel="noreferrer">
                  PR #{status.pr.number}
                </a>
              )}
            </div>
          )}

          <StatusBar status={status} />
          <div className="env-actions">
            {launchers.map((launcher) => (
              <button
                key={launcher.id}
                className="action-btn"
                onClick={() => onLaunch(launcher.id, color.name)}
                title={launcher.label}
              >
                {ICONS[launcher.icon] ?? ICONS.default}
                {launcher.label}
              </button>
            ))}
          </div>
          {status?.active && !status.pr && (status.ahead > 0 || status.changedFiles > 0) && (
            <button
              className="pr-btn"
              style={{ borderColor: color.hex, color: color.hex }}
              onClick={() => onCreatePr(color.name)}
            >
              Create PR
            </button>
          )}
          {merged && (
            <button
              className="release-merged-btn"
              onClick={() => onRelease(color.name)}
            >
              Release Slot
            </button>
          )}

          {editing && (
            <EditTaskModal
              env={env}
              onClose={() => setEditing(false)}
              onSave={(updates) => onUpdateTask(color.name, updates)}
            />
          )}
        </div>
      ) : (
        <div className="env-empty">
          <button
            className="assign-btn"
            style={{ borderColor: color.hex, color: color.hex }}
            onClick={() => onAssign(color.name)}
          >
            + Assign Task
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main app ────────────────────────────────────────────────────────────────

function AppInner() {
  const [config, setConfig] = useState(null);
  const [envs, setEnvs] = useState({});
  const [statuses, setStatuses] = useState({});
  const [issues, setIssues] = useState([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [pickerColor, setPickerColor] = useState(null);
  const [pickerRepoId, setPickerRepoId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [releaseColor, setReleaseColor] = useState(null);
  const [cardOrder, setCardOrder] = useState({});
  const [sectionOrder, setSectionOrder] = useState(null);
  const [prProposal, setPrProposal] = useState(null);
  const pollRef = useRef(null);
  const abortRef = useRef(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    api("/config").then((r) => !r.error && setConfig(r));
    api("/environments").then((r) => !r.error && setEnvs(r));
    api("/layout").then((r) => {
      if (r.cardOrder) setCardOrder(r.cardOrder);
      if (r.sectionOrder) setSectionOrder(r.sectionOrder);
    });
  }, []);

  // Batched status polling with AbortController
  useEffect(() => {
    function pollStatuses() {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      fetch("/api/environments/statuses", { signal: controller.signal })
        .then((r) => r.json())
        .then((data) => setStatuses(data))
        .catch(() => {}); // aborted or network error — ignore
    }

    pollStatuses();
    pollRef.current = setInterval(pollStatuses, 10000);
    return () => {
      clearInterval(pollRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [envs]);

  function fetchIssuesForRepo(repoId) {
    setIssuesLoading(true);
    api(`/github/issues?repo=${encodeURIComponent(repoId)}`)
      .then(setIssues)
      .finally(() => setIssuesLoading(false));
  }

  function handleAssign(color) {
    const repos = config?.repos ?? [];
    if (repos.length === 1) {
      setPickerColor(color);
      setPickerRepoId(repos[0].id);
      fetchIssuesForRepo(repos[0].id);
    } else {
      setPickerColor(color);
      setPickerRepoId(null);
    }
  }

  function handlePickRepo(repoId) {
    setPickerRepoId(repoId);
    fetchIssuesForRepo(repoId);
  }

  async function handlePick(issue) {
    const color = pickerColor;
    const repoId = pickerRepoId;
    setPickerColor(null);
    setPickerRepoId(null);
    const result = await api(`/environments/${color}/assign`, {
      method: "POST",
      body: JSON.stringify({ issue, repoId }),
    });
    if (result.ok) {
      const updated = await api("/environments");
      if (!updated.error) setEnvs(updated);
    }
  }

  function handleRelease(color) {
    setReleaseColor(color);
  }

  async function confirmRelease() {
    const color = releaseColor;
    setReleaseColor(null);
    await api(`/environments/${color}/release`, {
      method: "POST",
      body: JSON.stringify({ removeWorktree: true }),
    });
    setStatuses((prev) => { const n = { ...prev }; delete n[color]; return n; });
    const updated = await api("/environments");
    if (!updated.error) setEnvs(updated);
  }

  function handleLaunch(launcherId, color) {
    api("/launch", {
      method: "POST",
      body: JSON.stringify({ launcherId, color }),
    });
  }

  async function handleUpdateTask(color, updates) {
    await api(`/environments/${color}/issue`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    const updated = await api("/environments");
    if (!updated.error) setEnvs(updated);
  }

  async function handleCreatePr(color) {
    const proposal = await api(`/environments/${color}/propose-pr`, { method: "POST" });
    if (proposal.error) return alert(`Failed: ${proposal.error}`);
    setPrProposal({ color, ...proposal });
  }

  async function handleSubmitPr({ branch, title, body }) {
    const color = prProposal.color;
    const result = await api(`/environments/${color}/create-pr`, {
      method: "POST",
      body: JSON.stringify({ branch, title, body }),
    });
    setPrProposal(null);
    if (result.ok) {
      alert(`PR created: ${result.output}`);
      // Refresh status for this color
      const s = await api(`/environments/${color}/status`);
      if (!s.error) setStatuses((prev) => ({ ...prev, [color]: s }));
      const updated = await api("/environments");
      if (!updated.error) setEnvs(updated);
    } else {
      alert(`Failed: ${result.error}`);
    }
  }

  // ── DnD handlers ──────────────────────────────────────────────────────────

  function persistLayout(newCardOrder, newSectionOrder) {
    const body = {};
    if (newCardOrder !== undefined) body.cardOrder = newCardOrder;
    if (newSectionOrder !== undefined) body.sectionOrder = newSectionOrder;
    api("/layout", { method: "PUT", body: JSON.stringify(body) });
  }

  function handleCardDragEnd(repoId, event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentOrder = cardOrder[repoId] ?? envsByRepoColors(repoId);
    const oldIndex = currentOrder.indexOf(active.id);
    const newIndex = currentOrder.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(currentOrder, oldIndex, newIndex);
    const updated = { ...cardOrder, [repoId]: newOrder };
    setCardOrder(updated);
    persistLayout(updated, undefined);
  }

  function handleSectionDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const currentOrder = orderedRepos.map((r) => r.id);
    const oldIndex = currentOrder.indexOf(active.id);
    const newIndex = currentOrder.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(currentOrder, oldIndex, newIndex);
    setSectionOrder(newOrder);
    persistLayout(undefined, newOrder);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!config) return <div className="loading">Loading...</div>;

  if (config.setupRequired) {
    return (
      <SetupWizard onComplete={() => {
        api("/config").then((r) => !r.error && setConfig(r));
      }} />
    );
  }

  const launchers = config.launchers ?? [];
  const repos = config.repos ?? [];
  const multiRepo = repos.length > 1;
  const hasRepos = repos.length > 0;

  if (!hasRepos) {
    return (
      <div className="app">
        <div className="onboarding">
          <h1>Claude Workbench</h1>
          <p>Add a project to get started.</p>
          <button className="onboarding-btn" onClick={() => setShowSettings(true)}>
            + Add Project
          </button>
        </div>
        {showSettings && (
          <SettingsPanel
            repos={repos}
            onClose={() => setShowSettings(false)}
            onReposChanged={() => { api("/config").then((r) => !r.error && setConfig(r)); api("/environments").then((r) => !r.error && setEnvs(r)); }}
          />
        )}
      </div>
    );
  }

  // Group environments by repo
  const envsByRepo = {};
  for (const [color, env] of Object.entries(envs)) {
    const rid = env.repoId ?? "unknown";
    if (!envsByRepo[rid]) envsByRepo[rid] = [];
    envsByRepo[rid].push({ color, env, colorDef: config.colors.find((c) => c.name === color) });
  }

  function envsByRepoColors(repoId) {
    return (envsByRepo[repoId] ?? []).map((e) => e.color);
  }

  // Sort envs within each repo by persisted card order
  for (const [repoId, repoEnvs] of Object.entries(envsByRepo)) {
    const order = cardOrder[repoId];
    if (order) {
      repoEnvs.sort((a, b) => {
        const ai = order.indexOf(a.color);
        const bi = order.indexOf(b.color);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      });
    }
  }

  // Sort repos by persisted section order
  const orderedRepos = sectionOrder
    ? [...repos].sort((a, b) => {
        const ai = sectionOrder.indexOf(a.id);
        const bi = sectionOrder.indexOf(b.id);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      })
    : repos;

  const usedColors = new Set(Object.keys(envs));
  const freeColors = config.colors.filter((c) => !usedColors.has(c.name));

  return (
    <div className="app">
      <header className="app-header">
        <h1>Claude Workbench</h1>
        <button className="settings-btn" onClick={() => setShowSettings(true)} title="Manage projects">
          + Project
        </button>
      </header>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
        <SortableContext items={orderedRepos.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <main className="board-sections">
            {orderedRepos.map((repo) => {
              const repoEnvs = envsByRepo[repo.id] ?? [];
              const cardIds = repoEnvs.map((e) => e.color);
              return (
                <SortableSection key={repo.id} id={repo.id}>
                  <div className="project-header">
                    {freeColors.length > 0 && (
                      <button
                        className="new-task-btn"
                        style={{ borderColor: freeColors[0].hex, color: freeColors[0].hex }}
                        onClick={() => {
                          setPickerColor(freeColors[0].name);
                          setPickerRepoId(repo.id);
                          fetchIssuesForRepo(repo.id);
                        }}
                      >
                        +
                      </button>
                    )}
                    <span className="project-name">{repo.id}</span>
                    {repo.repo && <span className="project-url">{repo.repo.split("/").slice(-2).join("/")}</span>}
                    <span className="project-env-count">{repoEnvs.length}</span>
                    <button
                      className="project-delete-btn"
                      title="Remove project"
                      onClick={async () => {
                        if (!confirm(`Remove project "${repo.id}"? This will release all its environments.`)) return;
                        await api(`/repos/${encodeURIComponent(repo.id)}`, { method: "DELETE" });
                        api("/config").then((r) => !r.error && setConfig(r));
                        api("/environments").then((r) => !r.error && setEnvs(r));
                      }}
                    >
                      ×
                    </button>
                  </div>
                  {repoEnvs.length > 0 && (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(event) => handleCardDragEnd(repo.id, event)}
                    >
                      <SortableContext items={cardIds} strategy={horizontalListSortingStrategy}>
                        <div className="project-envs">
                          {repoEnvs.map(({ color, env, colorDef }) => (
                            <SortableCard key={color} id={color}>
                              <EnvCard
                                color={colorDef ?? { name: color, hex: "#888", bg: "#111" }}
                                env={env}
                                status={statuses[color]}
                                launchers={launchers}
                                multiRepo={multiRepo}
                                onAssign={handleAssign}
                                onRelease={handleRelease}
                                onLaunch={handleLaunch}
                                onCreatePr={handleCreatePr}
                                onUpdateTask={handleUpdateTask}
                              />
                            </SortableCard>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </SortableSection>
              );
            })}
          </main>
        </SortableContext>
      </DndContext>
      {pickerColor && !pickerRepoId && repos.length > 1 && (
        <RepoPickerModal
          repos={repos}
          onPick={handlePickRepo}
          onClose={() => setPickerColor(null)}
        />
      )}
      {pickerColor && pickerRepoId && (
        <TaskPickerModal
          issues={issues}
          loading={issuesLoading}
          onPick={handlePick}
          onClose={() => { setPickerColor(null); setPickerRepoId(null); }}
        />
      )}
      {releaseColor && (
        <ReleaseModal
          color={releaseColor}
          status={statuses[releaseColor]}
          onClose={() => setReleaseColor(null)}
          onConfirm={confirmRelease}
        />
      )}
      {prProposal && (
        <CreatePrModal
          proposal={prProposal}
          onClose={() => setPrProposal(null)}
          onSubmit={handleSubmitPr}
        />
      )}
      {showSettings && (
        <SettingsPanel
          repos={repos}
          onClose={() => setShowSettings(false)}
          onReposChanged={() => { api("/config").then((r) => !r.error && setConfig(r)); api("/environments").then((r) => !r.error && setEnvs(r)); }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
