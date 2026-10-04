import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** <Modal open title onClose size="sm|md|lg|xl" footer={<>buttons</>}>  Closes on Esc / backdrop click. */
export default function Modal({ open = true, title, onClose, size, footer, children, dismissable = true }) {
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (e.key === 'Escape' && dismissable) onClose?.(); };
    document.addEventListener('keydown', h);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = prev; };
  }, [open, onClose, dismissable]);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && dismissable) onClose?.(); }}>
      <div className={`modal ${size || ''}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        {(title || onClose) && (
          <div className="modal-head">
            <h2>{title}</h2>
            {onClose && <button className="btn ghost icon sm" onClick={onClose} aria-label="Close"><X size={16} /></button>}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>, document.body);
}
