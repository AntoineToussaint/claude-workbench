import { useState } from "react";
import { StatusBar } from "./StatusBar";
import { EditTaskModal } from "./EditTaskModal";
import { ICONS } from "../lib/icons";

export function EnvCard({ color, env, launchers, status, multiRepo, onAssign, onRelease, onLaunch, onCreatePr, onUpdateTask }) {
  const merged = status?.merged;
  const [editing, setEditing] = useState(false);
  const labels = env?.issue?.labels ?? [];
  const body = env?.issue?.body;

  const cardColor = merged ? "#22c55e" : color.hex;
  const isWorking = status?.claudeState === "working";

  return (
    <div className={`env-card${merged ? " env-card-merged" : ""}`} style={{ "--card-color": cardColor, "--card-color-alpha": `${cardColor}30` }}>
      <div className="env-header">
        <span className={`env-dot${isWorking ? " working" : ""}`} style={{ background: cardColor }} />
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
              <div className="env-description">{body.length > 120 ? body.slice(0, 120) + "\u2026" : body}</div>
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
