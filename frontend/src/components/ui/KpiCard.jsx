import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import Card from './Card.jsx';

export function Delta({ value, suffix = '%', invert }) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const up = value > 0.05, down = value < -0.05;
  const good = invert ? down : up, bad = invert ? up : down;
  const cls = good ? 'up' : bad ? 'down' : 'flat';
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return <span className={`delta ${cls}`}><Icon size={14} />{Math.abs(value).toFixed(1)}{suffix}</span>;
}

/** <KpiCard label value icon={<Icon/>} delta={12.3} invertDelta hint="vs previous" spark={<Sparkline/>} /> (a.k.a. Stat) */
export default function KpiCard({ label, value, icon, delta, invertDelta, hint, spark, children, className = '', onClick }) {
  return (
    <Card className={`kpi ${className}`} hover={!!onClick} clickable={!!onClick} onClick={onClick}>
      <div className="row between start">
        <div className="kpi-label">{label}</div>
        {icon && <div className="kpi-icon">{icon}</div>}
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-foot">
        <div className="row gap-6">{delta !== undefined && <Delta value={delta} invert={invertDelta} />}{hint && <span className="muted xs">{hint}</span>}</div>
        {spark}
      </div>
      {children}
    </Card>
  );
}
export { KpiCard as Stat };
