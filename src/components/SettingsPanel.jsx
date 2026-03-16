import { useState } from "react";
import api from "../lib/api";
import { useConfirm } from "../hooks/useConfirm.jsx";

export function SettingsPanel({ repos, onClose, onReposChanged }) {
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [manualPath, setManualPath] = useState(false);
  const [pathInput, setPathInput] = useState("");
  const [confirmKill, setConfirmKill] = useState(false);
  const confirm = useConfirm();

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
    if (!(await confirm("Remove project?", `Remove project "${id}"?`, { confirmText: "Remove", danger: true }))) return;
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
