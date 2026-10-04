import { X } from 'lucide-react';

/** <Chip active onClick icon size="sm" onRemove>label</Chip> - renders a button when onClick is given. */
export default function Chip({ active, onClick, icon, size, onRemove, className = '', children, title }) {
  const cls = ['chip', active && 'active', size, className].filter(Boolean).join(' ');
  const inner = <>{icon}{children}{onRemove && <X size={12} className="x" onClick={(e) => { e.stopPropagation(); onRemove(); }} />}</>;
  return onClick ? <button type="button" className={cls} onClick={onClick} title={title} aria-pressed={!!active}>{inner}</button> : <span className={cls} title={title}>{inner}</span>;
}
