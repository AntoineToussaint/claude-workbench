import { createContext, useContext, useState, useCallback, useRef } from "react";

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((title, message, options = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ title, message, ...options });
    });
  }, []);

  function handleConfirm() {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setState(null);
  }

  function handleCancel() {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="modal-overlay confirm-overlay" onClick={handleCancel}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="confirm-title">{state.title}</h3>
            {state.message && <p className="confirm-message">{state.message}</p>}
            <div className="confirm-actions">
              <button className="confirm-cancel-btn" onClick={handleCancel}>
                {state.cancelText ?? "Cancel"}
              </button>
              <button
                className={`confirm-ok-btn${state.danger ? " confirm-danger" : ""}`}
                onClick={handleConfirm}
              >
                {state.confirmText ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}
