export function ReleaseModal({ color, status, onClose, onConfirm }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Release {color}?</h3>
        <p className="confirm-text">This will remove the worktree and free the slot.</p>
        <div className="release-status-info">
          {!status ? (
            <div className="release-info">Loading status...</div>
          ) : (
            <>
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
            </>
          )}
        </div>
        <div className="confirm-actions">
          <button className="modal-cancel-btn" onClick={onClose}>Cancel</button>
          <button className="confirm-release-btn" onClick={onConfirm}>Release</button>
        </div>
      </div>
    </div>
  );
}
