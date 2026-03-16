import { createContext, useContext, useState, useCallback, useRef } from "react";
import { Toast } from "../components/Toast";

const ToastContext = createContext(null);

const DEFAULT_DURATIONS = {
  success: 4000,
  error: 8000,
  info: 5000,
};

const MAX_TOASTS = 5;

let nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const remove = useCallback((id) => {
    clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((type, title, message, duration) => {
    const id = ++nextId;
    const dur = duration ?? DEFAULT_DURATIONS[type] ?? 5000;
    const toast = { id, type, title, message, duration: dur };

    setToasts((prev) => {
      const next = [...prev, toast];
      // Trim to max visible
      if (next.length > MAX_TOASTS) {
        const removed = next.shift();
        clearTimeout(timersRef.current[removed.id]);
        delete timersRef.current[removed.id];
      }
      return next;
    });

    timersRef.current[id] = setTimeout(() => remove(id), dur);
    return id;
  }, [remove]);

  const toast = useCallback((type, title, message, duration) => {
    return addToast(type, title, message, duration);
  }, [addToast]);

  toast.success = (title, message, duration) => addToast("success", title, message, duration);
  toast.error = (title, message, duration) => addToast("error", title, message, duration);
  toast.info = (title, message, duration) => addToast("info", title, message, duration);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
