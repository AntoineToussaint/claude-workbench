export function StatusBar({ status }) {
  if (!status) return (
    <div className="status-bar">
      <span className="status-dot dead" title="Checking..." />
      <span className="status-tag" style={{ opacity: 0.5 }}>checking...</span>
    </div>
  );
  if (!status.active) return null;
  const needsAttention = status.claudeState === "approval" || status.claudeState === "waiting";
  const claudeLabels = { working: "working", approval: "waiting for you", waiting: "idle", shell: "shell" };
  const claudeLabel = claudeLabels[status.claudeState] ?? null;

  const reviewDecision = status.pr?.reviewDecision;
  const reviewClass = reviewDecision === "APPROVED" ? "review-approved"
    : reviewDecision === "CHANGES_REQUESTED" ? "review-changes"
    : reviewDecision === "REVIEW_REQUIRED" ? "review-pending"
    : null;
  const reviewLabel = reviewDecision === "APPROVED" ? "\u2713 Approved"
    : reviewDecision === "CHANGES_REQUESTED" ? "\u2717 Changes requested"
    : reviewDecision === "REVIEW_REQUIRED" ? "Review requested"
    : null;

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
      {reviewLabel && (
        <span className={`status-tag ${reviewClass}`}>{reviewLabel}</span>
      )}
      {status.pr?.commentCount > 0 && (
        <span className="status-tag pr-comments" title={`${status.pr.commentCount} comment${status.pr.commentCount > 1 ? "s" : ""} on PR`}>
          {status.pr.commentCount} {status.pr.commentCount === 1 ? "comment" : "comments"}
        </span>
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
              {[...status.checks.items]
                .filter((c) => c.status !== "SKIPPED")
                .sort((a, b) => {
                  const order = { FAILURE: 0, TIMED_OUT: 0, CANCELLED: 0, IN_PROGRESS: 1, QUEUED: 1, PENDING: 1, SUCCESS: 2 };
                  return (order[a.status] ?? 1) - (order[b.status] ?? 1);
                })
                .map((c, i) => (
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
