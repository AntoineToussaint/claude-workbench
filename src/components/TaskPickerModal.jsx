import { useState } from "react";

export function TaskPickerModal({ issues, loading, onPick, onClose }) {
  const [search, setSearch] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customBody, setCustomBody] = useState("");

  const safeIssues = Array.isArray(issues) ? issues : [];
  const filtered = safeIssues.filter(
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
