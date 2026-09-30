import { createContext, useCallback, useContext, useRef, useState } from "react";
import Icon from "./Icon.jsx";

// Small confirmation messages that slide up and disappear on their own
const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = useCallback((text, kind = "ok") => {
    clearTimeout(timer.current);
    setToast({ text, kind, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), 4200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-zone" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast ${toast.kind}`}>
            <Icon name={toast.kind === "error" ? "close" : "check"} size={18} />
            <span>{toast.text}</span>
            <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">×</button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
