import { useState, useEffect } from "react";
import { createPortal } from "react-dom";

export function EditTaskModal({ env, onClose, onSave }) {
  const [title, setTitle] = useState(env.issue.title);
  const [body, setBody] = useState(env.issue.body ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    await onSave({ title: title.trim(), body: body.trim() });
    setSaving(false);
    onClose();
  }

  return createPortal(
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
    </div>,
    document.body
  );
}
