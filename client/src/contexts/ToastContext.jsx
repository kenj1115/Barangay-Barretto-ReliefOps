import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

const TOAST_STYLES = {
  success: {
    border: 'border-emerald-verified/30',
    iconBg: 'bg-success-container text-on-success-container',
    icon: 'check_circle',
  },
  error: {
    border: 'border-crimson-alert/30',
    iconBg: 'bg-error-container text-on-error-container',
    icon: 'error',
  },
  warning: {
    border: 'border-amber-fifo/30',
    iconBg: 'bg-warning-container text-on-warning-container',
    icon: 'warning',
  },
  info: {
    border: 'border-primary/30',
    iconBg: 'bg-primary-container text-on-primary-container',
    icon: 'info',
  },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4500) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-[calc(100%-2.5rem)] pointer-events-none"
      >
        {toasts.map((toast) => {
          const style = TOAST_STYLES[toast.type] || TOAST_STYLES.info;
          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto bg-surface-container-lowest border ${style.border} rounded-md shadow-md p-3.5 flex items-start gap-2.5 transition-all duration-surface-enter ease-surface-enter`}
            >
              <span
                className={`w-7 h-7 rounded-full ${style.iconBg} flex items-center justify-center shrink-0`}
              >
                <span className="material-symbols-outlined text-title-sm" aria-hidden="true">
                  {style.icon}
                </span>
              </span>
              <span className="flex-1 font-body text-body-sm text-on-surface pt-1">
                {toast.message}
              </span>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => removeToast(toast.id)}
                className="w-6 h-6 rounded flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low transition-colors duration-state-change shrink-0"
              >
                <span className="material-symbols-outlined text-body-md" aria-hidden="true">
                  close
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
