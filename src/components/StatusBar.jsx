export function StatusBar({ status }) {
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
