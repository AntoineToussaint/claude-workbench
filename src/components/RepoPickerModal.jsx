export function RepoPickerModal({ repos, onPick, onClose }) {
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
