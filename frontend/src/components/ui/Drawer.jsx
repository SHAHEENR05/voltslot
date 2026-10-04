import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Right-side drawer (bottom sheet on mobile). <Drawer open title onClose wide footer> */
export default function Drawer({ open = true, title, onClose, wide, footer, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', h);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="overlay drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <aside className={`drawer ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="drawer-head">
          <h2 style={{ fontSize: 18 }}>{title}</h2>
          <button className="btn ghost icon sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </div>, document.body);
}
