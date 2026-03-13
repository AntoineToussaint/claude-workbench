import { useState, useEffect, useCallback, useRef } from "react";

function api(path, opts) {
  return fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  }).then((r) => r.json());
}

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
};

function IssuePickerModal({ issues, loading, onPick, onClose }) {
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

function SettingsPanel({ repos, onClose, onReposChanged }) {
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);

  async function handleBrowse() {
    setError(null);
    setAdding(true);
    const result = await api("/add-repo", { method: "POST" });
    setAdding(false);
    if (result.error) {
      if (result.error !== "Cancelled") setError(result.error);
    } else {
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

        <button
          className="kill-sessions-btn"
          onClick={async () => {
            const r = await api("/kill-sessions", { method: "POST" });
            setError(r.killed > 0 ? null : null);
          }}
        >
          Kill All Sessions
        </button>

        <div className="modal-footer">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

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
    </div>
  );
}

function EditIssueModal({ env, color, onClose, onSave }) {
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

function CreatePrModal({ color, proposal, onClose, onSubmit }) {
  const [branch, setBranch] = useState(proposal.branch);
  const [title, setTitle] = useState(proposal.title);
  const [body, setBody] = useState(proposal.body);
  const [submitting, setSubmitting] = useState(false);

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
            <button type="submit" className="modal-submit-btn" disabled={!title.trim() || !branch.trim() || submitting}>
              {submitting ? "Creating..." : "Create PR"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EnvCard({ color, env, launchers, status, multiRepo, onAssign, onRelease, onLaunch, onCreatePr, onUpdateIssue }) {
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
            title="Release environment"
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
            <EditIssueModal
              env={env}
              color={color.name}
              onClose={() => setEditing(false)}
              onSave={(updates) => onUpdateIssue(color.name, updates)}
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
            + Assign Issue
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState(null);
  const [envs, setEnvs] = useState({});
  const [statuses, setStatuses] = useState({});
  const [issues, setIssues] = useState([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [pickerColor, setPickerColor] = useState(null);
  const [pickerRepoId, setPickerRepoId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [releaseColor, setReleaseColor] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    api("/config").then(setConfig);
    api("/environments").then(setEnvs);
  }, []);

  // Poll statuses for active environments every 10s
  useEffect(() => {
    function pollStatuses() {
      const activeColors = Object.keys(envs);
      if (activeColors.length === 0) return;
      activeColors.forEach((color) => {
        api(`/environments/${color}/status`).then((s) => {
          setStatuses((prev) => ({ ...prev, [color]: s }));
        });
      });
    }

    pollStatuses();
    pollRef.current = setInterval(pollStatuses, 10000);
    return () => clearInterval(pollRef.current);
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
      // Single repo — skip repo picker, go straight to issues
      setPickerColor(color);
      setPickerRepoId(repos[0].id);
      fetchIssuesForRepo(repos[0].id);
    } else {
      // Multiple repos — show repo picker first
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
      setEnvs(updated);
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
    setEnvs(updated);
  }

  function handleLaunch(launcherId, color) {
    api("/launch", {
      method: "POST",
      body: JSON.stringify({ launcherId, color }),
    });
  }

  async function handleUpdateIssue(color, updates) {
    await api(`/environments/${color}/issue`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    const updated = await api("/environments");
    setEnvs(updated);
  }

  const [prProposal, setPrProposal] = useState(null); // { color, branch, title, body, needsBranch }

  async function handleCreatePr(color) {
    // Get AI-generated proposal
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
      const s = await api(`/environments/${color}/status`);
      setStatuses((prev) => ({ ...prev, [color]: s }));
      const updated = await api("/environments");
      setEnvs(updated);
    } else {
      alert(`Failed: ${result.error}`);
    }
  }

  if (!config) return <div className="loading">Loading...</div>;

  const launchers = config.launchers ?? [];
  const repos = config.repos ?? [];
  const multiRepo = repos.length > 1;
  const hasRepos = repos.length > 0;

  // No repos → show onboarding
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
            onReposChanged={() => { api("/config").then(setConfig); api("/environments").then(setEnvs); }}
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

  // Find next free color
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
      <main className="board-sections">
        {repos.map((repo) => {
          const repoEnvs = envsByRepo[repo.id] ?? [];
          return (
            <section key={repo.id} className="project-section">
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
              </div>
              {repoEnvs.length > 0 && (
                <div className="project-envs">
                  {repoEnvs.map(({ color, env, colorDef }) => (
                    <EnvCard
                      key={color}
                      color={colorDef ?? { name: color, hex: "#888", bg: "#111" }}
                      env={env}
                      status={statuses[color]}
                      launchers={launchers}
                      multiRepo={multiRepo}
                      onAssign={handleAssign}
                      onRelease={handleRelease}
                      onLaunch={handleLaunch}
                      onCreatePr={handleCreatePr}
                      onUpdateIssue={handleUpdateIssue}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </main>
      {pickerColor && !pickerRepoId && repos.length > 1 && (
        <RepoPickerModal
          repos={repos}
          onPick={handlePickRepo}
          onClose={() => setPickerColor(null)}
        />
      )}
      {pickerColor && pickerRepoId && (
        <IssuePickerModal
          issues={issues}
          loading={issuesLoading}
          onPick={handlePick}
          onClose={() => { setPickerColor(null); setPickerRepoId(null); }}
        />
      )}
      {releaseColor && (
        <div className="modal-overlay" onClick={() => setReleaseColor(null)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Release {releaseColor}?</h3>
            <p className="confirm-text">This will remove the worktree and free the slot.</p>
            <div className="confirm-actions">
              <button className="modal-cancel-btn" onClick={() => setReleaseColor(null)}>Cancel</button>
              <button className="confirm-release-btn" onClick={confirmRelease}>Release</button>
            </div>
          </div>
        </div>
      )}
      {prProposal && (
        <CreatePrModal
          color={prProposal.color}
          proposal={prProposal}
          onClose={() => setPrProposal(null)}
          onSubmit={handleSubmitPr}
        />
      )}
      {showSettings && (
        <SettingsPanel
          repos={repos}
          onClose={() => setShowSettings(false)}
          onReposChanged={() => { api("/config").then(setConfig); api("/environments").then(setEnvs); }}
        />
      )}
    </div>
  );
}
