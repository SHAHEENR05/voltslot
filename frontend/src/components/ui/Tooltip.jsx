import { Info } from 'lucide-react';

/** <Tooltip text="..." bottom right>children</Tooltip>   <InfoTip text="..." /> (info icon). */
export default function Tooltip({ text, children, bottom, right }) {
  return <span className={`tip ${bottom ? 'bottom' : ''} ${right ? 'align-right' : ''}`}>{children}<span className="tip-bubble" role="tooltip">{text}</span></span>;
}
export function InfoTip({ text, bottom = true, right }) {
  return <Tooltip text={text} bottom={bottom} right={right}><span className="info-dot" tabIndex={0}><Info size={14} /></span></Tooltip>;
}
