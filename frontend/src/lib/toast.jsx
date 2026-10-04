import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const ToastCtx = createContext(null);
const ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info };

/** useToast() -> { success(msg), error(msg), info(msg), show(type,msg,ms) }. Accepts strings or ApiError (uses .message). */
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const id = useRef(0);
  const dismiss = useCallback((i) => setItems((x) => x.filter((t) => t.id !== i)), []);
  const show = useCallback((type, msg, ms = 4200) => {
    const text = typeof msg === 'string' ? msg : msg?.message || 'Something happened';
    const i = ++id.current;
    setItems((x) => [...x.slice(-3), { id: i, type, text }]);
    if (ms) setTimeout(() => dismiss(i), ms);
  }, [dismiss]);
  const api = useMemo(() => ({
    show, success: (m, ms) => show('success', m, ms), error: (m, ms) => show('error', m, ms ?? 6000), info: (m, ms) => show('info', m, ms),
  }), [show]);
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((t) => {
          const Icon = ICONS[t.type];
          return (
            <div key={t.id} className={`toast ${t.type}`}>
              <Icon size={18} className="t-icon" />
              <div>{t.text}</div>
              <button className="t-close" onClick={() => dismiss(t.id)} aria-label="Dismiss"><X size={15} /></button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
