import { useState } from "react";

export function CreatePrModal({ proposal, onClose, onSubmit }) {
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
