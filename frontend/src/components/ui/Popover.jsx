import { useEffect, useRef, useState } from 'react';

/** Click-to-open popover. <Popover trigger={(open,toggle)=><Button/>} align="left|right" width={320}>content</Popover> */
export default function Popover({ trigger, children, align = 'left', width = 320, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {trigger(open, () => setOpen((o) => !o))}
      {open && <div className={`pop-menu ${className}`} style={{ top: 'calc(100% + 8px)', [align]: 0, width: `min(${width}px, 92vw)` }}>{children(() => setOpen(false))}</div>}
    </div>
  );
}
