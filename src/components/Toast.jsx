import { useState, useEffect } from "react";

export function Toast({ toast, onDismiss }) {
  const [exiting, setExiting] = useState(false);

  function handleDismiss() {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 250);
  }

  // If auto-dismissed by parent, still animate out
  useEffect(() => {
    return () => {};
  }, []);

  const borderColor =
    toast.type === "success"
      ? "var(--color-success)"
      : toast.type === "error"
        ? "var(--color-danger)"
        : "var(--accent)";

  return (
    <div
      className={`toast toast-${toast.type}${exiting ? " toast-exit" : ""}`}
      style={{ borderLeftColor: borderColor }}
    >
      <div className="toast-content">
        <div className="toast-title">{toast.title}</div>
        {toast.message && <div className="toast-message">{toast.message}</div>}
      </div>
      <button className="toast-close" onClick={handleDismiss} aria-label="Dismiss">
        &times;
      </button>
      <div
        className="toast-progress"
        style={{
          backgroundColor: borderColor,
          animationDuration: `${toast.duration}ms`,
        }}
      />
    </div>
  );
}
